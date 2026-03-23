import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { Loader2, ArrowLeft, Clock, CheckCircle, XCircle, DollarSign, Calendar, Car, User, Star, MapPin, MessageSquare } from 'lucide-react';
import { driverService } from '../../services/driver';
import { useSocket } from '../../context/SocketContext';
import ErrorBoundary from '../../components/ErrorBoundary';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapContainerStyle = {
  width: '100%',
  height: '350px',
  borderRadius: '0.5rem',
};

const defaultCenter = { lat: 42.2679, lng: 42.6946 };

const mapOptions = {
  disableDefaultUI: false,
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

function AdminDriverInfoContent() {
  const { id } = useParams();
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [reviewStats, setReviewStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(!!window.google?.maps);
  const mapRef = useRef(null);

  useEffect(() => {
    fetchData();
    if (!mapsLoaded && GOOGLE_MAPS_API_KEY) {
      loadGoogleMapsScript().then(() => setMapsLoaded(true));
    }
  }, [id]);

  // Listen for real-time location updates
  useEffect(() => {
    if (!socket) return;

    const handleLocationUpdate = (payload) => {
      if (payload.driverId === id) {
        setDriverLocation({
          lat: payload.location.latitude,
          lng: payload.location.longitude,
        });
      }
    };

    socket.on('driver:locationUpdate', handleLocationUpdate);
    return () => socket.off('driver:locationUpdate', handleLocationUpdate);
  }, [socket, id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [activityRes, reviewsRes, driverRes] = await Promise.all([
        driverService.getActivity(id),
        driverService.getReviews(id),
        driverService.getById(id),
      ]);

      if (activityRes.success) {
        setData(activityRes.data);
      }
      if (reviewsRes.success) {
        setReviews(reviewsRes.data.reviews || []);
        setReviewStats(reviewsRes.data.statistics || null);
      }
      // Set initial location from driver data
      if (driverRes.success && driverRes.data.driver?.location?.coordinates) {
        const [lng, lat] = driverRes.data.driver.location.coordinates;
        if (lat && lng) {
          setDriverLocation({ lat, lng });
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load driver info');
    } finally {
      setLoading(false);
    }
  };

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Pan map when location changes
  useEffect(() => {
    if (mapRef.current && driverLocation) {
      mapRef.current.panTo(driverLocation);
    }
  }, [driverLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{error}</p>
        <Link to="/admin/drivers" className="text-primary hover:underline">Back to Drivers</Link>
      </div>
    );
  }

  if (!data) return null;

  const { driver, calendar, totals } = data;
  const maxActiveHours = Math.max(...calendar.map(d => d.activeHours), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/drivers" className="p-2 border rounded-lg hover:bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Driver Activity</h1>
          <p className="text-muted-foreground">{driver.name} - Last 7 Days</p>
        </div>
      </div>

      {/* Driver Info + Live Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Driver Info Card */}
        <div className="border rounded-lg p-6">
          <div className="flex items-start gap-4">
            {driver.profileImage ? (
              <img
                src={driver.profileImage}
                alt={driver.name}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7" />
              </div>
            )}
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-semibold">{driver.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-semibold">{driver.phone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vehicle</p>
                <p className="font-semibold">{driver.vehicle?.make} {driver.vehicle?.model} ({driver.vehicle?.year})</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  driver.status === 'online' ? 'bg-green-100 text-green-800' :
                  driver.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {driver.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rating</p>
                <p className="font-semibold flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500" />
                  {(driver.rating || 0).toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trips</p>
                <p className="font-semibold">{driver.totalTrips || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="font-semibold">{(driver.totalEarnings || 0).toFixed(2)} GEL</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">License Plate</p>
                <p className="font-semibold font-mono">{driver.vehicle?.licensePlate}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Location Map */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Live Location</h2>
            {driverLocation && (
              <span className="ml-auto text-xs text-muted-foreground">
                {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
              </span>
            )}
          </div>
          {mapsLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={driverLocation || defaultCenter}
              zoom={driverLocation ? 15 : 12}
              onLoad={onMapLoad}
              options={mapOptions}
            >
              {driverLocation && (
                <Marker
                  position={driverLocation}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW || 1,
                    scale: 6,
                    fillColor: '#3b82f6',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                    rotation: 0,
                  }}
                  title={driver.name}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center bg-secondary rounded-lg" style={{ height: '350px' }}>
              {GOOGLE_MAPS_API_KEY ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-muted-foreground text-sm">Google Maps API key not configured</p>
              )}
            </div>
          )}
          {!driverLocation && mapsLoaded && (
            <p className="text-sm text-muted-foreground mt-2">No location data available. Location updates when driver is online.</p>
          )}
        </div>
      </div>

      {/* 7-Day Summary Cards */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <Calendar className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{totals.activeDays}<span className="text-xs font-normal text-muted-foreground"> / 7</span></p>
          <span className="text-xs text-muted-foreground">Active Days</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-green-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{totals.activeHours}<span className="text-xs font-normal text-muted-foreground">h</span></p>
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-muted-foreground">{totals.offlineHours}<span className="text-xs font-normal">h</span></p>
          <span className="text-xs text-muted-foreground">Offline</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <MapPin className="w-4 h-4 text-purple-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{totals.offered}</p>
          <span className="text-xs text-muted-foreground">Offered</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <CheckCircle className="w-4 h-4 text-green-600 mx-auto mb-1" />
          <p className="text-xl font-bold text-green-700">{totals.accepted}</p>
          <span className="text-xs text-muted-foreground">Accepted</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <XCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-red-600">{totals.declined}</p>
          <span className="text-xs text-muted-foreground">Declined</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <Car className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-blue-700">{totals.completed}</p>
          <span className="text-xs text-muted-foreground">Completed</span>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <DollarSign className="w-4 h-4 text-green-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{totals.earnings.toFixed(2)}<span className="text-xs font-normal text-muted-foreground"> GEL</span></p>
          <span className="text-xs text-muted-foreground">Earnings</span>
        </div>
      </div>

      {/* 7-Day Calendar */}
      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">7-Day Calendar</h2>

        {/* Activity Bar Chart */}
        <div className="flex items-end gap-2 mb-6 h-40">
          {calendar.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center justify-end h-28">
                <span className="text-xs font-medium mb-1">{day.activeHours}h</span>
                <div
                  className="w-full bg-green-500 rounded-t-md transition-all"
                  style={{
                    height: `${Math.max((day.activeHours / maxActiveHours) * 100, 2)}%`,
                    minHeight: day.activeHours > 0 ? '8px' : '2px'
                  }}
                />
              </div>
              <span className="text-xs font-medium">{day.dayLabel}</span>
              <span className="text-xs text-muted-foreground">{day.date.slice(5)}</span>
            </div>
          ))}
        </div>

        {/* Daily Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Day</th>
                <th className="text-center py-2 px-2 font-medium">Hours</th>
                <th className="text-center py-2 px-2 font-medium">Offered</th>
                <th className="text-center py-2 px-2 font-medium">Accepted</th>
                <th className="text-center py-2 px-2 font-medium">Declined</th>
                <th className="text-center py-2 px-2 font-medium">Completed</th>
                <th className="text-right py-2 px-2 font-medium">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map((day) => (
                <tr key={day.date} className="border-b last:border-0 hover:bg-secondary/50">
                  <td className="py-2 px-2">
                    <span className="font-medium">{day.dayLabel}</span>
                    <span className="text-muted-foreground ml-1">{day.date.slice(5)}</span>
                  </td>
                  <td className="text-center py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      day.activeHours > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {day.activeHours}h
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">
                    <span className={day.offered > 0 ? 'font-semibold' : 'text-muted-foreground'}>
                      {day.offered}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">
                    <span className={day.accepted > 0 ? 'font-semibold text-green-700' : 'text-muted-foreground'}>
                      {day.accepted}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">
                    <span className={day.declined > 0 ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
                      {day.declined}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">
                    <span className={day.completed > 0 ? 'font-semibold text-blue-700' : 'text-muted-foreground'}>
                      {day.completed}
                    </span>
                  </td>
                  <td className="text-right py-2 px-2 font-medium">{day.earnings.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 px-2">Total</td>
                <td className="text-center py-2 px-2 text-green-700">{totals.activeHours}h</td>
                <td className="text-center py-2 px-2">{totals.offered}</td>
                <td className="text-center py-2 px-2 text-green-700">{totals.accepted}</td>
                <td className="text-center py-2 px-2 text-red-600">{totals.declined}</td>
                <td className="text-center py-2 px-2 text-blue-700">{totals.completed}</td>
                <td className="text-right py-2 px-2">{totals.earnings.toFixed(2)} GEL</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Reviews</h2>
          {reviewStats && (
            <span className="ml-auto text-sm text-muted-foreground">
              {reviewStats.totalReviews} reviews - Avg {reviewStats.averageRating} / 5
            </span>
          )}
        </div>

        {/* Rating Distribution */}
        {reviewStats && reviewStats.totalReviews > 0 && (
          <div className="mb-6 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviewStats.ratingDistribution?.[star] || 0;
              const pct = reviewStats.totalReviews > 0 ? (count / reviewStats.totalReviews) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-right">{star}</span>
                  <Star className="w-3 h-3 text-yellow-500" />
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Review List */}
        {reviews && reviews.length > 0 ? (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {reviews.map((review) => (
              <div key={review._id} className="border-b last:border-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {review.user?.firstName} {review.user?.lastName}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {review.reviewedAt ? new Date(review.reviewedAt).toLocaleDateString() : ''}
                  </span>
                </div>
                {review.review && (
                  <p className="text-sm text-muted-foreground mt-1">{review.review}</p>
                )}
                <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                  {review.pickup?.address && (
                    <span>From: {review.pickup.address.substring(0, 40)}{review.pickup.address.length > 40 ? '...' : ''}</span>
                  )}
                  {review.fare > 0 && <span>Fare: {review.fare.toFixed(2)} GEL</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">No reviews yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDriverInfo() {
  return (
    <ErrorBoundary>
      <AdminDriverInfoContent />
    </ErrorBoundary>
  );
}
