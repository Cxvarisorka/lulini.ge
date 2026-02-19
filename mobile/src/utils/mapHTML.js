/**
 * Map HTML generator for TaxiScreen WebView.
 * Primary: Google Maps JavaScript API
 * Fallback: Leaflet + OpenStreetMap (if no API key or Google fails to load)
 *
 * All public functions keep the same signatures so TaxiScreen.js
 * injectJavaScript calls work unchanged.
 */

const SHARED_STYLES = `
  html, body { margin: 0; padding: 0; background: #f5f5f5; }
  #map { width: 100%; height: 100vh; background: #f5f5f5; }

  @keyframes pulse-green {
    0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
    70% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }
  @keyframes pulse-dark {
    0% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.5); }
    70% { box-shadow: 0 0 0 14px rgba(23, 23, 23, 0); }
    100% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
  }

  .pickup-marker {
    background: #22c55e;
    border: 3px solid white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    animation: pulse-green 2s ease-out infinite;
  }
  .destination-marker {
    background: #ef4444;
    border: 3px solid white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }
  .driver-marker {
    background: #171717;
    border: 3px solid white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    animation: pulse-dark 2s ease-out infinite;
  }
  .nearby-driver-marker {
    background: #374151;
    border: 2px solid white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }
`;

// ---------------------------------------------------------------------------
// Google Maps version
// ---------------------------------------------------------------------------
function googleMapsScript(lat, lng) {
  return `
    var map, HTMLOverlay;
    var pickupOverlay = null, destinationOverlay = null;
    var driverOverlay = null, clickOverlay = null;
    var routeLine = null;
    var nearbyDriverOverlays = [];
    var mapClickMode = false;
    var lastDriverRouteFetch = 0;

    function initMap() {
      /* ---- custom HTML overlay class ---- */
      HTMLOverlay = function(pos, html, size, m) {
        this.pos = pos; this.html_ = html; this.size_ = size;
        this.div_ = null; this.setMap(m);
      };
      HTMLOverlay.prototype = Object.create(google.maps.OverlayView.prototype);
      HTMLOverlay.prototype.constructor = HTMLOverlay;
      HTMLOverlay.prototype.onAdd = function() {
        this.div_ = document.createElement('div');
        this.div_.style.position = 'absolute';
        this.div_.innerHTML = this.html_;
        this.getPanes().overlayMouseTarget.appendChild(this.div_);
      };
      HTMLOverlay.prototype.draw = function() {
        var p = this.getProjection();
        if (!p || !this.div_) return;
        var px = p.fromLatLngToDivPixel(this.pos);
        this.div_.style.left = (px.x - this.size_/2) + 'px';
        this.div_.style.top  = (px.y - this.size_/2) + 'px';
      };
      HTMLOverlay.prototype.onRemove = function() {
        if (this.div_ && this.div_.parentNode) {
          this.div_.parentNode.removeChild(this.div_);
          this.div_ = null;
        }
      };
      HTMLOverlay.prototype.setPosition = function(p) {
        this.pos = p;
        if (this.getProjection()) this.draw();
      };
      HTMLOverlay.prototype.getPosition = function() { return this.pos; };

      /* ---- map ---- */
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: ${lat}, lng: ${lng} },
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        clickableIcons: false
      });

      // Leaflet-compat: map.setView([lat,lng], zoom)
      map.setView = function(c, z) {
        map.setCenter({ lat: c[0], lng: c[1] });
        if (z !== undefined) map.setZoom(z);
      };

      pickupOverlay = new HTMLOverlay(
        new google.maps.LatLng(${lat}, ${lng}),
        '<div class="pickup-marker"></div>', 20, map
      );

      map.addListener('click', function(e) {
        if (!mapClickMode) return;
        var lt = e.latLng.lat(), ln = e.latLng.lng();
        if (clickOverlay) {
          clickOverlay.setPosition(new google.maps.LatLng(lt, ln));
        } else {
          clickOverlay = new HTMLOverlay(
            new google.maps.LatLng(lt, ln),
            '<div class="destination-marker"></div>', 20, map
          );
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:'mapClick', latitude:lt, longitude:ln
        }));
      });
    }

    /* ---- helpers ---- */
    function _retry(fn, args) {
      if (!map) { setTimeout(function(){ fn.apply(null, args); }, 100); return true; }
      return false;
    }
    function _pickupPos() { return pickupOverlay.getPosition(); }

    function _drawStraight(a, b) {
      if (routeLine) routeLine.setMap(null);
      routeLine = new google.maps.Polyline({
        path:[{lat:a.lat(),lng:a.lng()},{lat:b.lat(),lng:b.lng()}],
        strokeColor:'#171717', strokeWeight:4, strokeOpacity:0.8, map:map
      });
    }

    function _osrmRoute(fromLat, fromLng, toLat, toLng, onPath) {
      var url = 'https://router.project-osrm.org/route/v1/driving/'
        + fromLng+','+fromLat+';'+toLng+','+toLat+'?overview=full&geometries=geojson';
      fetch(url).then(function(r){return r.json();}).then(function(d){
        if (d.code==='Ok' && d.routes && d.routes.length>0) {
          onPath(d.routes[0].geometry.coordinates.map(function(c){
            return {lat:c[1],lng:c[0]};
          }));
        } else { onPath(null); }
      }).catch(function(){ onPath(null); });
    }

    /* ---- public API (same signatures as Leaflet version) ---- */
    function updatePickupMarker(lat, lng) {
      if (_retry(updatePickupMarker, arguments)) return;
      var p = new google.maps.LatLng(lat, lng);
      if (pickupOverlay) pickupOverlay.setPosition(p);
      else pickupOverlay = new HTMLOverlay(p,'<div class="pickup-marker"></div>',20,map);
      map.setCenter(p); map.setZoom(15);
    }

    function updateDestinationMarker(lat, lng) {
      if (_retry(updateDestinationMarker, arguments)) return;
      var p = new google.maps.LatLng(lat, lng);
      if (destinationOverlay) destinationOverlay.setPosition(p);
      else destinationOverlay = new HTMLOverlay(p,'<div class="destination-marker"></div>',20,map);

      var pk = _pickupPos();
      _osrmRoute(pk.lat(), pk.lng(), lat, lng, function(path){
        if (routeLine) routeLine.setMap(null);
        if (path) {
          routeLine = new google.maps.Polyline({
            path:path, strokeColor:'#171717', strokeWeight:4, strokeOpacity:0.8, map:map
          });
        } else { _drawStraight(pk, p); }
      });
    }

    function updateRouteWithPolyline(destLat, destLng, polylineCoords) {
      if (_retry(updateRouteWithPolyline, arguments)) return;
      var p = new google.maps.LatLng(destLat, destLng);
      if (destinationOverlay) destinationOverlay.setPosition(p);
      else destinationOverlay = new HTMLOverlay(p,'<div class="destination-marker"></div>',20,map);

      if (routeLine) routeLine.setMap(null);
      if (polylineCoords && polylineCoords.length > 0) {
        var path = polylineCoords.map(function(c){ return {lat:c[0],lng:c[1]}; });
        routeLine = new google.maps.Polyline({
          path:path, strokeColor:'#171717', strokeWeight:5, strokeOpacity:0.9, map:map
        });
        var b = new google.maps.LatLngBounds();
        path.forEach(function(pt){ b.extend(pt); });
        map.fitBounds(b, 50);
      } else {
        _drawStraight(_pickupPos(), p);
      }
    }

    function clearDestinationMarker() {
      if (destinationOverlay) { destinationOverlay.setMap(null); destinationOverlay = null; }
      if (routeLine) { routeLine.setMap(null); routeLine = null; }
    }

    function fitBounds(lat1, lng1, lat2, lng2) {
      if (_retry(fitBounds, arguments)) return;
      var b = new google.maps.LatLngBounds(
        {lat:Math.min(lat1,lat2), lng:Math.min(lng1,lng2)},
        {lat:Math.max(lat1,lat2), lng:Math.max(lng1,lng2)}
      );
      map.fitBounds(b, 50);
    }

    function updateDriverMarker(lat, lng) {
      if (_retry(updateDriverMarker, arguments)) return;
      var p = new google.maps.LatLng(lat, lng);
      if (driverOverlay) driverOverlay.setPosition(p);
      else driverOverlay = new HTMLOverlay(p,'<div class="driver-marker">\\u{1F697}</div>',24,map);

      var pk = _pickupPos();
      var b = new google.maps.LatLngBounds();
      b.extend(p); b.extend(pk);
      map.fitBounds(b, 80);

      var now = Date.now();
      if (now - lastDriverRouteFetch > 5000) {
        lastDriverRouteFetch = now;
        fetchDriverRoute(lat, lng, pk.lat(), pk.lng());
      }
    }

    function fetchDriverRoute(dLat, dLng, pLat, pLng) {
      _osrmRoute(dLat, dLng, pLat, pLng, function(path){
        if (routeLine) routeLine.setMap(null);
        if (path) {
          routeLine = new google.maps.Polyline({
            path:path, strokeColor:'#171717', strokeWeight:4, strokeOpacity:0.8, map:map
          });
        } else {
          routeLine = new google.maps.Polyline({
            path:[{lat:dLat,lng:dLng},{lat:pLat,lng:pLng}],
            strokeColor:'#171717', strokeWeight:4, strokeOpacity:0.8, map:map
          });
        }
      });
    }

    function clearDriverMarker() {
      if (driverOverlay) { driverOverlay.setMap(null); driverOverlay = null; }
    }

    function showNearbyDrivers(drivers) {
      clearNearbyDrivers();
      drivers.forEach(function(d){
        nearbyDriverOverlays.push(
          new HTMLOverlay(new google.maps.LatLng(d.lat,d.lng),
            '<div class="nearby-driver-marker">\\u{1F697}</div>',20,map)
        );
      });
    }

    function clearNearbyDrivers() {
      nearbyDriverOverlays.forEach(function(o){ o.setMap(null); });
      nearbyDriverOverlays = [];
    }

    function enableMapClickMode() {
      mapClickMode = true;
      map.setOptions({ draggableCursor:'crosshair' });
    }

    function disableMapClickMode() {
      mapClickMode = false;
      map.setOptions({ draggableCursor:null });
      if (clickOverlay) { clickOverlay.setMap(null); clickOverlay = null; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Leaflet / OpenStreetMap fallback
// ---------------------------------------------------------------------------
function leafletScript(lat, lng) {
  return `
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${lat}, ${lng}], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    var pickupIcon = L.divIcon({ className: 'pickup-marker', iconSize: [20,20], iconAnchor: [10,10] });
    var destinationIcon = L.divIcon({ className: 'destination-marker', iconSize: [20,20], iconAnchor: [10,10] });
    var driverIcon = L.divIcon({ className: 'driver-marker', html: '\\u{1F697}', iconSize: [24,24], iconAnchor: [12,12] });

    var pickupMarker = L.marker([${lat}, ${lng}], {icon: pickupIcon}).addTo(map);
    var destinationMarker = null;
    var driverMarker = null;
    var routeLine = null;

    function updatePickupMarker(lat, lng) {
      pickupMarker.setLatLng([lat, lng]);
      map.setView([lat, lng], 15);
    }

    function updateDestinationMarker(lat, lng) {
      if (destinationMarker) { destinationMarker.setLatLng([lat, lng]); }
      else { destinationMarker = L.marker([lat, lng], {icon: destinationIcon}).addTo(map); }

      var pickup = pickupMarker.getLatLng();
      var url = 'https://router.project-osrm.org/route/v1/driving/' + pickup.lng + ',' + pickup.lat + ';' + lng + ',' + lat + '?overview=full&geometries=geojson';
      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            if (routeLine) { map.removeLayer(routeLine); }
            routeLine = L.polyline(coords, { color: '#171717', weight: 4, opacity: 0.8 }).addTo(map);
          } else {
            if (routeLine) { map.removeLayer(routeLine); }
            routeLine = L.polyline([[pickup.lat, pickup.lng], [lat, lng]], { color: '#171717', weight: 4, opacity: 0.8 }).addTo(map);
          }
        })
        .catch(function() {
          if (routeLine) { map.removeLayer(routeLine); }
          routeLine = L.polyline([[pickup.lat, pickup.lng], [lat, lng]], { color: '#171717', weight: 4, opacity: 0.8 }).addTo(map);
        });
    }

    function updateRouteWithPolyline(destLat, destLng, polylineCoords) {
      if (destinationMarker) { destinationMarker.setLatLng([destLat, destLng]); }
      else { destinationMarker = L.marker([destLat, destLng], {icon: destinationIcon}).addTo(map); }
      if (routeLine) { map.removeLayer(routeLine); }
      if (polylineCoords && polylineCoords.length > 0) {
        routeLine = L.polyline(polylineCoords, { color: '#171717', weight: 5, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        var bounds = routeLine.getBounds();
        map.fitBounds(bounds, {padding: [50, 50]});
      } else {
        var pickup = pickupMarker.getLatLng();
        routeLine = L.polyline([[pickup.lat, pickup.lng], [destLat, destLng]], { color: '#171717', weight: 4, opacity: 0.8 }).addTo(map);
      }
    }

    function clearDestinationMarker() {
      if (destinationMarker) { map.removeLayer(destinationMarker); destinationMarker = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    }

    function fitBounds(lat1, lng1, lat2, lng2) {
      var bounds = L.latLngBounds([[lat1, lng1], [lat2, lng2]]);
      map.fitBounds(bounds, {padding: [50, 50]});
    }

    var lastDriverRouteFetch = 0;

    function updateDriverMarker(lat, lng) {
      if (driverMarker) { driverMarker.setLatLng([lat, lng]); }
      else { driverMarker = L.marker([lat, lng], {icon: driverIcon}).addTo(map); }
      var pickup = pickupMarker.getLatLng();
      var bounds = L.latLngBounds([[lat, lng], [pickup.lat, pickup.lng]]);
      map.fitBounds(bounds, {padding: [80, 80]});
      var now = Date.now();
      if (now - lastDriverRouteFetch > 5000) {
        lastDriverRouteFetch = now;
        fetchDriverRoute(lat, lng, pickup.lat, pickup.lng);
      }
    }

    function fetchDriverRoute(dLat, dLng, pLat, pLng) {
      var url = 'https://router.project-osrm.org/route/v1/driving/' + dLng + ',' + dLat + ';' + pLng + ',' + pLat + '?overview=full&geometries=geojson';
      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            if (routeLine) { map.removeLayer(routeLine); }
            routeLine = L.polyline(coords, { color: '#171717', weight: 4, opacity: 0.8 }).addTo(map);
          }
        })
        .catch(function() {
          if (routeLine) { map.removeLayer(routeLine); }
          routeLine = L.polyline([[dLat, dLng], [pLat, pLng]], { color: '#171717', weight: 4, opacity: 0.8, dashArray: '10, 10' }).addTo(map);
        });
    }

    function clearDriverMarker() {
      if (driverMarker) { map.removeLayer(driverMarker); driverMarker = null; }
    }

    var nearbyDriverMarkers = [];
    var nearbyDriverIcon = L.divIcon({ className: 'nearby-driver-marker', html: '\\u{1F697}', iconSize: [20,20], iconAnchor: [10,10] });

    function showNearbyDrivers(drivers) {
      clearNearbyDrivers();
      drivers.forEach(function(d) {
        var marker = L.marker([d.lat, d.lng], {icon: nearbyDriverIcon}).addTo(map);
        nearbyDriverMarkers.push(marker);
      });
    }

    function clearNearbyDrivers() {
      nearbyDriverMarkers.forEach(function(m) { map.removeLayer(m); });
      nearbyDriverMarkers = [];
    }

    var mapClickMode = false;
    var clickMarker = null;

    function enableMapClickMode() {
      mapClickMode = true;
      map.getContainer().style.cursor = 'crosshair';
    }

    function disableMapClickMode() {
      mapClickMode = false;
      map.getContainer().style.cursor = '';
      if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
    }

    map.on('click', function(e) {
      if (mapClickMode) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        if (clickMarker) { clickMarker.setLatLng([lat, lng]); }
        else { clickMarker = L.marker([lat, lng], {icon: destinationIcon}).addTo(map); }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapClick', latitude: lat, longitude: lng
        }));
      }
    });
  `;
}

// ---------------------------------------------------------------------------
// Public generator
// ---------------------------------------------------------------------------
export default function generateMapHTML(lat, lng, googleMapsApiKey) {
  const useGoogle = !!googleMapsApiKey;

  const headScripts = useGoogle
    ? ''
    : `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>`;

  const bodyScript = useGoogle
    ? googleMapsScript(lat, lng)
    : leafletScript(lat, lng);

  const tailScript = useGoogle
    ? `<script
         src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap"
         async defer
         onerror="fallbackToLeaflet()"
       ><\/script>
       <script>
         function fallbackToLeaflet() {
           var s1 = document.createElement('link');
           s1.rel = 'stylesheet';
           s1.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
           document.head.appendChild(s1);
           var s2 = document.createElement('script');
           s2.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
           s2.onload = function() {
             document.getElementById('map').innerHTML = '';
             ${leafletScript(lat, lng)}
           };
           document.head.appendChild(s2);
         }
       <\/script>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      ${headScripts}
      <style>${SHARED_STYLES}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>${bodyScript}<\/script>
      ${tailScript}
    </body>
    </html>
  `;
}
