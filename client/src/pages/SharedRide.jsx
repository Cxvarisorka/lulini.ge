import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { MapPin, Car, Clock, User, Star, AlertTriangle, Loader2, Navigation } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const ACTIVE_STATUSES = ['accepted', 'driver_arrived', 'in_progress'];
const POLL_ACTIVE = 5000;   // 5s for active rides
const POLL_IDLE = 15000;    // 15s for pending/completed

const STATUS_CONFIG = {
  pending: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  accepted: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Car },
  driver_arrived: { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: MapPin },
  in_progress: { color: 'bg-green-100 text-green-800 border-green-200', icon: Navigation },
  completed: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: Star },
  cancelled: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle },
};

const mapContainerStyle = { width: '100%', height: '100%' };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
};

function loadGoogleMapsScript() {
  return new Promise((resolve) => {
    if (window.google?.maps) { resolve(); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { existing.addEventListener('load', resolve); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

const CAR_ICON_SVG = 'M29.395,0H17.636c-3.117,0-5.643,3.467-5.643,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644V6.584C35.037,3.467,32.511,0,29.395,0z M34.05,14.188v11.665l-2.729,0.351v-4.806L34.05,14.188z M32.618,10.773c-1.016,3.9-2.219,8.51-2.219,8.51H16.631l-2.222-8.51C14.41,10.773,23.293,7.755,32.618,10.773z M15.741,21.713v4.492l-2.73-0.349V14.502L15.741,21.713z M13.011,37.938V27.579l2.73,0.343v8.196L13.011,37.938z M14.568,40.882l2.218-3.336h13.771l2.219,3.336H14.568z M31.321,35.805v-7.872l2.729-0.355v10.048L31.321,35.805z';

export function SharedRide() {
  const { token: urlToken } = useParams();
  const { t } = useTranslation();
  const tokenRef = useRef(urlToken);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(!!window.google?.maps);
  const [directions, setDirections] = useState(null);
  const [map, setMap] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const hasFitBounds = useRef(false);

  // Load Google Maps script
  useEffect(() => {
    if (!mapLoaded && GOOGLE_MAPS_API_KEY) {
      loadGoogleMapsScript().then(() => setMapLoaded(true));
    }
  }, []);

  // Fetch ride data with adaptive polling
  useEffect(() => {
    let intervalId;
    let cancelled = false;

    async function fetchRide() {
      try {
        let res = await fetch(`${API_URL}/safety/rides/shared/${tokenRef.current}`);
        if (cancelled) return;

        // If 404, the token might be a rideId — try resolving it
        if (res.status === 404 && tokenRef.current === urlToken) {
          const trackRes = await fetch(`${API_URL}/safety/rides/track/${urlToken}`);
          if (trackRes.ok) {
            const trackData = await trackRes.json();
            tokenRef.current = trackData.data.shareToken;
            res = await fetch(`${API_URL}/safety/rides/shared/${tokenRef.current}`);
            if (cancelled) return;
          }
        }

        if (res.status === 410) {
          setExpired(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || t('sharedRide.notFound'));
        }

        const data = await res.json();
        setRide(data.data);
        setError(null);

        // Stop polling if ride is done
        if (data.data.status === 'completed' || data.data.status === 'cancelled') {
          clearInterval(intervalId);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRide();
    const isActive = ride && ACTIVE_STATUSES.includes(ride.status);
    intervalId = setInterval(fetchRide, isActive ? POLL_ACTIVE : POLL_IDLE);

    return () => { cancelled = true; clearInterval(intervalId); };
  }, [urlToken, t, ride?.status]);

  // Calculate route directions
  useEffect(() => {
    if (!mapLoaded || !ride?.pickup || !ride?.dropoff || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: ride.pickup.lat, lng: ride.pickup.lng },
        destination: { lat: ride.dropoff.lat, lng: ride.dropoff.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        }
      }
    );
  }, [mapLoaded, ride?.pickup?.lat, ride?.dropoff?.lat]);

  // Fit bounds once when data is ready
  useEffect(() => {
    if (!map || !ride || hasFitBounds.current) return;

    const bounds = new window.google.maps.LatLngBounds();
    if (ride.pickup) bounds.extend({ lat: ride.pickup.lat, lng: ride.pickup.lng });
    if (ride.dropoff) bounds.extend({ lat: ride.dropoff.lat, lng: ride.dropoff.lng });
    if (ride.driver?.location) bounds.extend({ lat: ride.driver.location.lat, lng: ride.driver.location.lng });

    map.fitBounds(bounds, { top: 60, bottom: 280, left: 40, right: 40 });
    hasFitBounds.current = true;
  }, [map, ride]);

  const onMapLoad = useCallback((mapInstance) => setMap(mapInstance), []);

  const formatTime = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isActive = ride && ACTIVE_STATUSES.includes(ride.status);
  const statusCfg = STATUS_CONFIG[ride?.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  // -- Full-screen loading / error / expired states --
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-gray-500">{t('sharedRide.loading')}</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center px-6">
          <AlertTriangle className="mx-auto h-14 w-14 text-yellow-500" />
          <h2 className="mt-4 text-xl font-semibold">{t('sharedRide.expired')}</h2>
          <p className="mt-2 text-gray-500">{t('sharedRide.expiredDesc')}</p>
        </div>
      </div>
    );
  }

  if (error && !ride) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center px-6">
          <AlertTriangle className="mx-auto h-14 w-14 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold">{t('sharedRide.error')}</h2>
          <p className="mt-2 text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const defaultCenter = ride?.pickup
    ? { lat: ride.pickup.lat, lng: ride.pickup.lng }
    : { lat: 41.7151, lng: 44.8271 };

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Map */}
      <div className="flex-1 relative">
        {mapLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={13}
            onLoad={onMapLoad}
            options={mapOptions}
          >
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: '#000000',
                    strokeWeight: 4,
                    strokeOpacity: 0.8,
                  },
                }}
              />
            )}

            {/* Pickup marker */}
            {ride.pickup && (
              <Marker
                position={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                  scale: 8,
                  fillColor: '#22c55e',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                }}
                title={ride.pickup.address}
              />
            )}

            {/* Dropoff marker */}
            {ride.dropoff && (
              <Marker
                position={{ lat: ride.dropoff.lat, lng: ride.dropoff.lng }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                  scale: 8,
                  fillColor: '#ef4444',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                }}
                title={ride.dropoff.address}
              />
            )}

            {/* Driver car marker */}
            {isActive && ride.driver?.location && (
              <Marker
                position={{ lat: ride.driver.location.lat, lng: ride.driver.location.lng }}
                icon={{
                  path: CAR_ICON_SVG,
                  scale: 0.6,
                  fillColor: '#000000',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 1,
                  anchor: window.google?.maps ? new window.google.maps.Point(24, 24) : undefined,
                }}
                title={ride.driver.firstName || 'Driver'}
                zIndex={10}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Live badge */}
        {isActive && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs font-semibold text-green-700">LIVE</span>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div
        className="relative bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out"
        style={{ maxHeight: panelOpen ? '50vh' : '80px' }}
      >
        {/* Drag handle */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-full px-4 py-1 shadow-sm hover:bg-gray-50 transition-colors z-10"
        >
          <div className="w-8 h-1 rounded-full bg-gray-300" />
        </button>

        <div className="overflow-y-auto p-4 pt-4" style={{ maxHeight: panelOpen ? 'calc(50vh - 8px)' : '72px' }}>
          {/* Status badge */}
          <div className="flex items-center justify-between mb-3">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium border ${statusCfg.color}`}>
              <StatusIcon className="h-4 w-4" />
              {t(`sharedRide.status.${ride.status}`)}
            </div>
            {ride.startTime && (
              <span className="text-xs text-gray-400">
                {t('sharedRide.startedAt')}: {formatTime(ride.startTime)}
              </span>
            )}
          </div>

          {panelOpen && (
            <>
              {/* Locations */}
              <div className="space-y-2 mb-4">
                {ride.pickup && (
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow shrink-0" />
                    <p className="text-sm text-gray-700 truncate">{ride.pickup.address}</p>
                  </div>
                )}
                {ride.pickup && ride.dropoff && (
                  <div className="ml-1.5 border-l-2 border-dashed border-gray-200 h-3" />
                )}
                {ride.dropoff && (
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow shrink-0" />
                    <p className="text-sm text-gray-700 truncate">{ride.dropoff.address}</p>
                  </div>
                )}
              </div>

              {/* Driver card */}
              {ride.driver && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    {ride.driver.profileImage ? (
                      <img
                        src={ride.driver.profileImage}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover border-2 border-white shadow"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 border-2 border-white shadow">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{ride.driver.firstName}</p>
                      {ride.driver.rating && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span>{ride.driver.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {ride.driver.vehicle && (
                    <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-white p-2.5 border border-gray-100">
                      <Car className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="text-sm min-w-0">
                        <span className="font-medium text-gray-900">
                          {ride.driver.vehicle.color} {ride.driver.vehicle.make} {ride.driver.vehicle.model}
                        </span>
                        <span className="mx-1.5 text-gray-300">|</span>
                        <span className="font-mono text-gray-600">{ride.driver.vehicle.licensePlate}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Completed/cancelled info */}
              {ride.endTime && (
                <p className="mt-3 text-xs text-gray-400 text-center">
                  {t('sharedRide.endedAt')}: {formatTime(ride.endTime)}
                </p>
              )}

              {/* Branding */}
              <p className="mt-3 text-[10px] text-gray-300 text-center tracking-wide uppercase">
                Lulini
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
