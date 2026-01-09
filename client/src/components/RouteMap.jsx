import { useEffect, useState, useCallback } from 'react';
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { MapPin, Navigation } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  minHeight: '400px'
};

const defaultCenter = {
  lat: 40.7128,
  lng: -74.0060
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    }
  ]
};

export function RouteMap({ pickup, dropoff, onRouteCalculated }) {
  const [directions, setDirections] = useState(null);
  const [map, setMap] = useState(null);

  const onLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Calculate route when pickup and dropoff change
  useEffect(() => {
    if (!pickup || !dropoff || !window.google) {
      setDirections(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: pickup.lat, lng: pickup.lng },
        destination: { lat: dropoff.lat, lng: dropoff.lng },
        travelMode: window.google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);

          // Extract distance and duration from the route
          const route = result.routes[0];
          if (route && route.legs[0]) {
            const leg = route.legs[0];
            onRouteCalculated?.({
              distance: leg.distance.value / 1000, // Convert meters to km
              distanceText: leg.distance.text,
              duration: Math.round(leg.duration.value / 60), // Convert seconds to minutes
              durationText: leg.duration.text
            });
          }
        } else {
          console.error('Directions request failed:', status);
          setDirections(null);
        }
      }
    );
  }, [pickup, dropoff, onRouteCalculated]);

  // Fit bounds when we have both locations but no directions yet
  useEffect(() => {
    if (map && pickup && dropoff && !directions) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, pickup, dropoff, directions]);

  // Center on single location
  useEffect(() => {
    if (map) {
      if (pickup && !dropoff) {
        map.panTo({ lat: pickup.lat, lng: pickup.lng });
        map.setZoom(14);
      } else if (dropoff && !pickup) {
        map.panTo({ lat: dropoff.lat, lng: dropoff.lng });
        map.setZoom(14);
      }
    }
  }, [map, pickup, dropoff]);

  const getCenter = () => {
    if (pickup) return { lat: pickup.lat, lng: pickup.lng };
    if (dropoff) return { lat: dropoff.lat, lng: dropoff.lng };
    return defaultCenter;
  };

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-border">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={getCenter()}
        zoom={12}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        {/* Show directions route if available */}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: '#000000',
                strokeWeight: 4,
                strokeOpacity: 0.8
              }
            }}
          />
        )}

        {/* Pickup marker */}
        {pickup && (
          <Marker
            position={{ lat: pickup.lat, lng: pickup.lng }}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              scale: 10,
              fillColor: '#22c55e',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
            }}
            title="Pickup Location"
          />
        )}

        {/* Dropoff marker */}
        {dropoff && (
          <Marker
            position={{ lat: dropoff.lat, lng: dropoff.lng }}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              scale: 10,
              fillColor: '#ef4444',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
            }}
            title="Dropoff Location"
          />
        )}
      </GoogleMap>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow"></div>
          <span className="text-muted-foreground">Pickup</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow"></div>
          <span className="text-muted-foreground">Dropoff</span>
        </div>
      </div>

      {/* No locations message */}
      {!pickup && !dropoff && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 pointer-events-none">
          <div className="text-center text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Enter pickup and dropoff locations<br />to see the route</p>
          </div>
        </div>
      )}
    </div>
  );
}
