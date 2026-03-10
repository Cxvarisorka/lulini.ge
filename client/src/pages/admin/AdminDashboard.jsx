import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navigation, Users, DollarSign, PhoneCall, MapPin, Car, Clock, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { rideService } from '../../services/ride';
import { useSocket } from '../../context/SocketContext';

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

const PREVIEW_COUNT = 5;

export function AdminDashboard() {
  const [recentRides, setRecentRides] = useState([]);
  const [totalRides, setTotalRides] = useState(0);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const navigate = useNavigate();

  const loadRecentRides = async () => {
    setLoading(true);
    try {
      const data = await rideService.getAll({ page: 1, limit: PREVIEW_COUNT });
      if (data?.data?.rides) {
        setRecentRides(data.data.rides);
        setTotalRides(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch recent rides:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentRides();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleRideUpdate = () => loadRecentRides();

    socket.on('ride:request', handleRideUpdate);
    socket.on('ride:accepted', handleRideUpdate);
    socket.on('ride:arrived', handleRideUpdate);
    socket.on('ride:started', handleRideUpdate);
    socket.on('ride:completed', handleRideUpdate);
    socket.on('ride:cancelled', handleRideUpdate);

    return () => {
      socket.off('ride:request', handleRideUpdate);
      socket.off('ride:accepted', handleRideUpdate);
      socket.off('ride:arrived', handleRideUpdate);
      socket.off('ride:started', handleRideUpdate);
      socket.off('ride:completed', handleRideUpdate);
      socket.off('ride:cancelled', handleRideUpdate);
    };
  }, [socket]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDriverName = (ride) => {
    if (!ride.driver) return null;
    const u = ride.driver.user;
    if (u?.firstName) return `${u.firstName} ${u.lastName || ''}`.trim();
    if (u?.name) return u.name;
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your taxi services
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Create Ride
            </CardTitle>
            <PhoneCall className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to="/admin/create-ride">
              <Button variant="outline" size="sm">New Phone Order</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxi Rides
            </CardTitle>
            <Navigation className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRides}</div>
            <p className="text-xs text-muted-foreground">Total rides</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Drivers
            </CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to="/admin/drivers">
              <Button variant="outline" size="sm">Manage Drivers</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pricing
            </CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to="/admin/pricing">
              <Button variant="outline" size="sm">Manage Pricing</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Rides */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Recent Rides
          </CardTitle>
          {totalRides > PREVIEW_COUNT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/rides')}
            >
              Show All ({totalRides})
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recentRides.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No rides yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentRides.map(ride => {
                const rideId = ride._id || ride.id;
                const driverName = getDriverName(ride);

                return (
                  <div
                    key={rideId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => navigate('/admin/rides')}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full shrink-0 ${statusColors[ride.status]}`}>
                        {statusLabels[ride.status]}
                      </span>
                      {ride.status === 'in_progress' && (
                        <span className="flex items-center gap-1 text-xs text-purple-600 shrink-0">
                          <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                          Live
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <span className="truncate">{ride.pickup?.address || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          <span className="truncate">{ride.dropoff?.address || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0 sm:text-right">
                      {driverName && (
                        <span className="flex items-center gap-1">
                          <Car className="h-3.5 w-3.5" />
                          {driverName}
                        </span>
                      )}
                      {ride.quote?.totalPrice > 0 && (
                        <span className="font-medium text-foreground">
                          {ride.fare?.toFixed(2) || ride.quote.totalPrice.toFixed(2)} GEL
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(ride.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {totalRides > PREVIEW_COUNT && (
                <div className="pt-2 text-center">
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => navigate('/admin/rides')}
                  >
                    View all {totalRides} rides
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Link to="/admin/create-ride">
              <Button>
                <PhoneCall className="mr-2 h-4 w-4" />
                Create Ride
              </Button>
            </Link>
            <Link to="/admin/rides">
              <Button variant="outline">
                <Navigation className="mr-2 h-4 w-4" />
                Taxi Rides
              </Button>
            </Link>
            <Link to="/admin/drivers">
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Manage Drivers
              </Button>
            </Link>
            <Link to="/admin/pricing">
              <Button variant="outline">
                <DollarSign className="mr-2 h-4 w-4" />
                Pricing
              </Button>
            </Link>
            <Link to="/">
              <Button variant="secondary">
                View Public Site
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
