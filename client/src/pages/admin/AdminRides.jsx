import { useState, useEffect, useCallback } from 'react';
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { Calendar, MapPin, User, Phone, Car, X, ChevronDown, Loader2, Navigation, Clock, DollarSign, Award, ChevronLeft, ChevronRight, Filter, Map } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { rideService } from '../../services/ride';
import { driverService } from '../../services/driver';
import { useSocket } from '../../context/SocketContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  driver_arrived: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels = {
  pending: 'Pending',
  accepted: 'Accepted',
  driver_arrived: 'Driver Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const vehicleTypes = {
  economy: 'Economy',
  comfort: 'Comfort',
  business: 'Business',
  van: 'Van',
  minibus: 'Minibus'
};

const defaultMapCenter = { lat: 42.2679, lng: 42.6946 };

const mapContainerStyle = {
  width: '100%',
  height: '300px',
  borderRadius: '0.5rem',
};

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

// Ride route map component
function RideRouteMap({ ride }) {
  const [directions, setDirections] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(!!window.google?.maps);

  useEffect(() => {
    if (!mapLoaded && GOOGLE_MAPS_API_KEY) {
      loadGoogleMapsScript().then(() => setMapLoaded(true));
    }
  }, []);

  useEffect(() => {
    if (!mapLoaded || !ride.pickup || !ride.dropoff || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();
    const waypoints = (ride.stops || []).map(stop => ({
      location: { lat: stop.lat, lng: stop.lng },
      stopover: true,
    }));

    directionsService.route(
      {
        origin: { lat: ride.pickup.lat, lng: ride.pickup.lng },
        destination: { lat: ride.dropoff.lat, lng: ride.dropoff.lng },
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        }
      }
    );
  }, [mapLoaded, ride.pickup, ride.dropoff, ride.stops]);

  if (!mapLoaded) {
    return (
      <div className="flex items-center justify-center bg-secondary rounded-lg" style={{ height: '300px' }}>
        {GOOGLE_MAPS_API_KEY ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-muted-foreground text-sm">Google Maps API key not configured</p>
        )}
      </div>
    );
  }

  const center = ride.pickup
    ? { lat: ride.pickup.lat, lng: ride.pickup.lng }
    : defaultMapCenter;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={13}
      options={mapOptions}
    >
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: true,
            polylineOptions: { strokeColor: '#000000', strokeWeight: 4, strokeOpacity: 0.8 },
          }}
        />
      )}

      {/* Pickup marker */}
      {ride.pickup && (
        <Marker
          position={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
          icon={{
            path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
            scale: 10,
            fillColor: '#22c55e',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
          title={`Pickup: ${ride.pickup.address}`}
        />
      )}

      {/* Stop markers */}
      {(ride.stops || []).map((stop, i) => (
        <Marker
          key={i}
          position={{ lat: stop.lat, lng: stop.lng }}
          icon={{
            path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
            scale: 8,
            fillColor: '#f59e0b',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
          title={`Stop ${i + 1}: ${stop.address}`}
        />
      ))}

      {/* Dropoff marker */}
      {ride.dropoff && (
        <Marker
          position={{ lat: ride.dropoff.lat, lng: ride.dropoff.lng }}
          icon={{
            path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
            scale: 10,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
          title={`Dropoff: ${ride.dropoff.address}`}
        />
      )}
    </GoogleMap>
  );
}

export function AdminRides() {
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverStats, setDriverStats] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterVehicleType, setFilterVehicleType] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRide, setExpandedRide] = useState(null);
  const [showMap, setShowMap] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const { socket } = useSocket();

  // Fetch rides and stats on mount
  useEffect(() => {
    loadRides();
  }, [page, filterStatus, filterDriver, filterVehicleType, filterStartDate, filterEndDate]);

  useEffect(() => {
    loadDriverStatistics();
    loadDriversList();
  }, []);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleRideRequest = (ride) => {
      setRides(prev => [ride, ...prev]);
    };
    const handleRideUpdate = (ride) => updateRideInList(ride);

    socket.on('ride:request', handleRideRequest);
    socket.on('ride:accepted', handleRideUpdate);
    socket.on('ride:arrived', handleRideUpdate);
    socket.on('ride:started', handleRideUpdate);
    socket.on('ride:completed', handleRideUpdate);
    socket.on('ride:cancelled', handleRideUpdate);

    return () => {
      socket.off('ride:request', handleRideRequest);
      socket.off('ride:accepted', handleRideUpdate);
      socket.off('ride:arrived', handleRideUpdate);
      socket.off('ride:started', handleRideUpdate);
      socket.off('ride:completed', handleRideUpdate);
      socket.off('ride:cancelled', handleRideUpdate);
    };
  }, [socket]);

  const loadRides = async () => {
    setLoading(true);
    try {
      const filters = {
        status: filterStatus !== 'all' ? filterStatus : undefined,
        driver: filterDriver || undefined,
        vehicleType: filterVehicleType !== 'all' ? filterVehicleType : undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        page,
        limit
      };
      const data = await rideService.getAll(filters);

      if (data?.data?.rides) {
        setRides(data.data.rides);
        setTotal(data.total);
        setPages(data.pages);
      } else {
        setRides([]);
        setTotal(0);
        setPages(0);
      }
    } catch (error) {
      console.error('Failed to fetch rides:', error);
      setRides([]);
      setTotal(0);
      setPages(0);
    } finally {
      setLoading(false);
    }
  };

  const loadDriversList = async () => {
    try {
      const data = await driverService.getAll();
      if (data?.success && data.data?.drivers) {
        setDrivers(data.data.drivers);
      }
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    }
  };

  const loadDriverStatistics = async () => {
    setStatsLoading(true);
    try {
      const data = await driverService.getAllStatistics();
      if (data?.data?.statistics) {
        setDriverStats(data.data.statistics);
      } else {
        setDriverStats([]);
      }
    } catch (error) {
      console.error('Failed to fetch driver statistics:', error);
      setDriverStats([]);
    } finally {
      setStatsLoading(false);
    }
  };

  const updateRideInList = (updatedRide) => {
    setRides(prev => {
      const index = prev.findIndex(r => (r._id || r.id) === (updatedRide._id || updatedRide.id));
      if (index !== -1) {
        const newRides = [...prev];
        newRides[index] = updatedRide;
        return newRides;
      }
      return prev;
    });
  };

  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setPage(1);
  };

  const clearFilters = () => {
    setFilterDriver('');
    setFilterVehicleType('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const hasActiveFilters = filterDriver || filterVehicleType !== 'all' || filterStartDate || filterEndDate;

  const handleCancel = async (rideId) => {
    setActionLoading(rideId);
    try {
      await rideService.cancel(rideId, 'other', 'Cancelled by admin');
      setCancelConfirm(null);
      loadRides();
    } catch (error) {
      console.error('Failed to cancel ride:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remainingMins}m`;
    return `${mins}m`;
  };

  const getDriverName = (ride) => {
    if (!ride.driver) return null;
    const u = ride.driver.user;
    if (u?.firstName) return `${u.firstName} ${u.lastName || ''}`.trim();
    if (u?.name) return u.name;
    if (u?.email) return u.email;
    return 'Driver';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Taxi Rides</h1>
          <p className="text-muted-foreground mt-1">
            Monitor all ride requests and live status
            <span className="ml-2 text-xs">({total} total rides)</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={hasActiveFilters ? 'border-primary text-primary' : ''}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && <span className="ml-1 w-2 h-2 bg-primary rounded-full" />}
          </Button>
          <Button onClick={loadRides} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Driver Filter */}
              <div>
                <label className="block text-sm font-medium mb-1">Driver</label>
                <select
                  value={filterDriver}
                  onChange={(e) => { setFilterDriver(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                >
                  <option value="">All Drivers</option>
                  {drivers.map(d => (
                    <option key={d._id} value={d._id}>
                      {d.user?.firstName} {d.user?.lastName} - {d.vehicle?.licensePlate}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vehicle Type Filter */}
              <div>
                <label className="block text-sm font-medium mb-1">Vehicle Type</label>
                <select
                  value={filterVehicleType}
                  onChange={(e) => { setFilterVehicleType(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                >
                  <option value="all">All Types</option>
                  {Object.entries(vehicleTypes).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium mb-1">From Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium mb-1">To Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'accepted', 'driver_arrived', 'in_progress', 'completed', 'cancelled'].map(status => (
          <button
            key={status}
            onClick={() => handleFilterChange(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === status
                ? 'bg-foreground text-background'
                : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
          >
            {status === 'all' ? 'All Rides' : statusLabels[status]}
          </button>
        ))}
      </div>

      {/* Rides List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="py-12 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : rides.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {hasActiveFilters
                ? 'No rides match the current filters.'
                : filterStatus === 'all'
                  ? 'No rides yet.'
                  : `No ${statusLabels[filterStatus]?.toLowerCase()} rides.`}
            </CardContent>
          </Card>
        ) : (
          rides.map(ride => {
            const rideId = ride._id || ride.id;
            const isLoading = actionLoading === rideId;
            const isExpanded = expandedRide === rideId;
            const isMapOpen = showMap === rideId;
            const driverName = getDriverName(ride);

            return (
              <Card key={rideId} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CardTitle className="font-mono text-sm">{rideId.slice(-8).toUpperCase()}</CardTitle>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[ride.status]}`}>
                        {statusLabels[ride.status]}
                      </span>
                      {ride.status === 'in_progress' && (
                        <span className="flex items-center gap-1 text-xs text-purple-600">
                          <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                          Live
                        </span>
                      )}
                      {driverName && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {driverName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(ride.createdAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMap(isMapOpen ? null : rideId)}
                        title="Show route map"
                      >
                        <Map className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRide(isExpanded ? null : rideId)}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Quick Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <div className="text-sm flex-1">
                        <p className="text-muted-foreground">Pickup</p>
                        <p className="font-medium truncate">{ride.pickup?.address || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div className="text-sm flex-1">
                        <p className="text-muted-foreground">Dropoff</p>
                        <p className="font-medium truncate">{ride.dropoff?.address || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Car className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="text-muted-foreground">Vehicle Type</p>
                        <p className="font-medium">{vehicleTypes[ride.vehicleType] || ride.vehicleType}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stops (if any) */}
                  {ride.stops && ride.stops.length > 0 && (
                    <div className="mb-4 pl-6 space-y-1">
                      {ride.stops.map((stop, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-muted-foreground">Stop {i + 1}:</span>
                          <span className="truncate">{stop.address}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Route Map */}
                  {isMapOpen && (
                    <div className="mb-4 border rounded-lg overflow-hidden">
                      <RideRouteMap ride={ride} />
                      <div className="p-2 bg-secondary/30 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
                          <span>Pickup</span>
                        </div>
                        {ride.stops?.length > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white shadow" />
                            <span>Stops ({ride.stops.length})</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
                          <span>Dropoff</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t pt-4 mt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Passenger Info */}
                        <div className="space-y-3">
                          <h4 className="font-medium">Passenger Information</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>{ride.passengerName}</span>
                            </div>
                            {ride.passengerPhone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <a href={`tel:${ride.passengerPhone}`} className="text-blue-600 hover:underline">
                                  {ride.passengerPhone}
                                </a>
                              </div>
                            )}
                            {ride.user && (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  User ID: {ride.user._id || ride.user}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Driver Info */}
                        <div className="space-y-3">
                          <h4 className="font-medium">Driver Information</h4>
                          {ride.driver ? (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{driverName}</span>
                              </div>
                              {ride.driver.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <a href={`tel:${ride.driver.phone}`} className="text-blue-600 hover:underline">
                                    {ride.driver.phone}
                                  </a>
                                </div>
                              )}
                              {ride.driver.vehicle && (
                                <div className="flex items-center gap-2">
                                  <Car className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {ride.driver.vehicle.make} {ride.driver.vehicle.model} - {ride.driver.vehicle.licensePlate}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Navigation className="h-4 w-4 text-muted-foreground" />
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  ride.driver.status === 'online' ? 'bg-green-100 text-green-800' :
                                  ride.driver.status === 'busy' ? 'bg-purple-100 text-purple-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {ride.driver.status}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Not assigned yet</p>
                          )}
                        </div>
                      </div>

                      {/* Trip Details */}
                      <div className="bg-secondary/50 rounded-lg p-4">
                        <h4 className="font-medium mb-2">Trip Details</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Distance</p>
                            <p className="font-medium">{ride.quote?.distanceText || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium">{ride.quote?.durationText || formatDuration(ride.quote?.duration)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Quote Price</p>
                            <p className="font-medium">{ride.quote?.totalPrice?.toFixed(2) || '0.00'} GEL</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Final Fare</p>
                            <p className="font-bold text-lg">{ride.fare?.toFixed(2) || (ride.quote?.totalPrice?.toFixed(2) || '0.00')} GEL</p>
                          </div>
                        </div>
                        {ride.startTime && (
                          <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-muted-foreground">Started</p>
                                <p className="font-medium">{formatDate(ride.startTime)}</p>
                              </div>
                            </div>
                            {ride.endTime && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="text-muted-foreground">Completed</p>
                                  <p className="font-medium">{formatDate(ride.endTime)}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Payment Info */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Payment Method</p>
                            <p className="font-medium capitalize">{ride.paymentMethod || 'cash'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">Payment Status</p>
                            <p className={`font-medium capitalize ${
                              ride.paymentStatus === 'completed' ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                              {ride.paymentStatus || 'pending'}
                            </p>
                          </div>
                        </div>
                        {ride.commission > 0 && (
                          <>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-muted-foreground">Commission ({ride.commissionPercent}%)</p>
                                <p className="font-medium text-green-600">{ride.commission?.toFixed(2)} GEL</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-muted-foreground">Driver Payout</p>
                                <p className="font-medium">{((ride.fare || 0) - (ride.commission || 0)).toFixed(2)} GEL</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Notes */}
                      {ride.notes && (
                        <div>
                          <h4 className="font-medium mb-2">Notes</h4>
                          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                            {ride.notes}
                          </p>
                        </div>
                      )}

                      {/* Cancellation Info */}
                      {ride.status === 'cancelled' && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <h4 className="font-medium text-red-800 mb-1">Cancellation Details</h4>
                          <p className="text-sm text-red-700">
                            Cancelled by: <span className="font-medium">{ride.cancelledBy}</span>
                          </p>
                          {ride.cancellationReason && (
                            <p className="text-sm text-red-700 mt-1">
                              Reason: {ride.cancellationReason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {ride.status !== 'cancelled' && ride.status !== 'completed' && (
                          <>
                            {cancelConfirm === rideId ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleCancel(rideId)}
                                  disabled={isLoading}
                                >
                                  {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                                  Confirm Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setCancelConfirm(null)}
                                  disabled={isLoading}
                                >
                                  Keep Ride
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setCancelConfirm(rideId)}
                                disabled={isLoading}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel Ride
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && rides.length > 0 && pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} rides
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                let pageNum;
                if (pages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pages - 2) {
                  pageNum = pages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className="min-w-[2.5rem]"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Driver Statistics Table */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Driver Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : driverStats.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No driver statistics available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Driver</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Vehicle</th>
                      <th className="text-center py-3 px-4 font-medium">Total Trips</th>
                      <th className="text-center py-3 px-4 font-medium">Cancelled</th>
                      <th className="text-right py-3 px-4 font-medium">24h Earnings</th>
                      <th className="text-right py-3 px-4 font-medium">7d Earnings</th>
                      <th className="text-right py-3 px-4 font-medium">30d Earnings</th>
                      <th className="text-right py-3 px-4 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverStats.map((driver) => (
                      <tr key={driver.driverId} className="border-b hover:bg-secondary/50 transition-colors">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{driver.name}</p>
                            <p className="text-xs text-muted-foreground">{driver.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            driver.status === 'online' ? 'bg-green-100 text-green-800' :
                            driver.status === 'busy' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {driver.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <p className="font-medium">{driver.vehicle.make} {driver.vehicle.model}</p>
                            <p className="text-xs text-muted-foreground">{driver.vehicle.licensePlate}</p>
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-lg">{driver.statistics.totalTrips}</span>
                            <span className="text-xs text-muted-foreground">
                              {driver.statistics.trips.last24Hours} (24h)
                            </span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className={`font-medium ${driver.statistics.cancelledTrips > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {driver.statistics.cancelledTrips}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-green-600">
                              {driver.statistics.earnings.last24Hours.toFixed(2)} GEL
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {driver.statistics.trips.last24Hours} trips
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-green-600">
                              {driver.statistics.earnings.last7Days.toFixed(2)} GEL
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {driver.statistics.trips.last7Days} trips
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-green-600">
                              {driver.statistics.earnings.last30Days.toFixed(2)} GEL
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {driver.statistics.trips.last30Days} trips
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-xl text-primary">
                              {driver.statistics.totalEarnings.toFixed(2)} GEL
                            </span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Award className="h-3 w-3" />
                              {driver.rating.toFixed(1)} rating
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
