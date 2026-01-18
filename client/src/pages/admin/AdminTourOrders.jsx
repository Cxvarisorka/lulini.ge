import { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, MapPin, Trash2, ChevronDown, Loader2, Users, Globe, Car, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useAdmin } from '../../context/AdminContext';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export function AdminTourOrders() {
  const { t } = useTranslation();
  const { tourOrders, updateTourOrderStatus, deleteTourOrder, fetchTourOrders } = useAdmin();
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      try {
        await fetchTourOrders();
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, []);

  const filteredOrders = filterStatus === 'all'
    ? tourOrders
    : tourOrders.filter(order => order.status === filterStatus);

  const handleStatusChange = async (orderId, newStatus) => {
    setActionLoading(orderId);
    try {
      await updateTourOrderStatus(orderId, newStatus);
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (orderId) => {
    setActionLoading(orderId);
    try {
      await deleteTourOrder(orderId);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete order:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const pendingCount = tourOrders.filter(o => o.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.sidebar.tourOrders')}</h1>
          <p className="text-muted-foreground mt-1">
            Manage tour booking requests
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.keys(statusLabels).map(status => {
          const count = tourOrders.filter(o => o.status === status).length;
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground capitalize">{statusLabels[status]}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full ${statusColors[status]} flex items-center justify-center opacity-20`}></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('all')}
            >
              All ({tourOrders.length})
            </Button>
            {Object.keys(statusLabels).map(status => (
              <Button
                key={status}
                variant={filterStatus === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus(status)}
              >
                {statusLabels[status]} ({tourOrders.filter(o => o.status === status).length})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Tour Bookings ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No tour bookings found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map(order => {
                const orderId = order._id || order.id;
                const isExpanded = expandedOrder === orderId;
                const isLoading = actionLoading === orderId;

                return (
                  <div key={orderId} className="border rounded-lg overflow-hidden">
                    {/* Order Header */}
                    <div className="p-4 bg-secondary/30 flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Tour Info */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Tour</p>
                          <div className="flex items-center gap-2">
                            {order.tourSnapshot?.image && (
                              <img
                                src={order.tourSnapshot.image}
                                alt={order.tourSnapshot.name}
                                className="w-10 h-10 object-cover rounded"
                              />
                            )}
                            <div>
                              <p className="font-medium text-sm">{order.tourSnapshot?.name || order.tour?.name || 'Tour'}</p>
                              <p className="text-xs text-muted-foreground">{order.tourSnapshot?.duration}</p>
                            </div>
                          </div>
                        </div>

                        {/* Customer */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Customer</p>
                          <div>
                            <p className="font-medium text-sm">{order.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {order.participants} {order.participants === 1 ? 'person' : 'people'}
                            </p>
                          </div>
                        </div>

                        {/* Date */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Date & Time</p>
                          <p className="font-medium text-sm">{formatDate(order.date)}</p>
                          <p className="text-xs text-muted-foreground">{order.time}</p>
                        </div>

                        {/* Price & Status */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total</p>
                          <p className="font-bold text-lg">${order.totalPrice}</p>
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[order.status]}`}>
                            {statusLabels[order.status]}
                          </span>
                        </div>
                      </div>

                      {/* Expand Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedOrder(isExpanded ? null : orderId)}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </Button>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="p-4 border-t space-y-6">
                        {/* Customer Details */}
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Customer Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Name</p>
                              <p className="font-medium">{order.name}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Email</p>
                              <p className="font-medium flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {order.email}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Phone</p>
                              <p className="font-medium flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {order.phone}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Language</p>
                              <p className="font-medium flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {order.language}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Linked Services */}
                        {(order.carRentalDetails || order.transferDetails) && (
                          <div>
                            <h4 className="font-semibold mb-3">Linked Services</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {order.carRentalDetails && (
                                <div className="p-3 bg-secondary/30 rounded-lg">
                                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Car className="w-4 h-4" />
                                    Car Rental
                                  </p>
                                  <p className="text-sm">{order.carRentalDetails.brand} {order.carRentalDetails.model}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {order.carRentalDetails.pickupDate} - {order.carRentalDetails.returnDate}
                                  </p>
                                  <p className="text-xs font-medium mt-1">${order.carRentalDetails.totalPrice}</p>
                                </div>
                              )}
                              {order.transferDetails && (
                                <div className="p-3 bg-secondary/30 rounded-lg">
                                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Navigation className="w-4 h-4" />
                                    Transfer ({order.transferDetails.tripType})
                                  </p>
                                  <p className="text-sm flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {order.transferDetails.pickupAddress}
                                  </p>
                                  <p className="text-sm flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {order.transferDetails.dropoffAddress}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">{order.transferDetails.date}</p>
                                  <p className="text-xs font-medium">${order.transferDetails.totalPrice}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {(order.notes || order.specialRequirements) && (
                          <div>
                            <h4 className="font-semibold mb-3">Notes & Requirements</h4>
                            {order.notes && (
                              <div className="mb-2">
                                <p className="text-sm text-muted-foreground">Notes</p>
                                <p className="text-sm">{order.notes}</p>
                              </div>
                            )}
                            {order.specialRequirements && (
                              <div>
                                <p className="text-sm text-muted-foreground">Special Requirements</p>
                                <p className="text-sm">{order.specialRequirements}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Booking Info */}
                        <div className="text-xs text-muted-foreground">
                          <p>Booking ID: {orderId}</p>
                          <p>Booked: {formatDateTime(order.createdAt)}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-4 border-t">
                          {order.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleStatusChange(orderId, 'confirmed')}
                                disabled={isLoading}
                              >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Booking'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(orderId, 'cancelled')}
                                disabled={isLoading}
                              >
                                Decline
                              </Button>
                            </>
                          )}
                          {order.status === 'confirmed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(orderId, 'completed')}
                              disabled={isLoading}
                            >
                              Mark as Completed
                            </Button>
                          )}
                          {deleteConfirm === orderId ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(orderId)}
                                disabled={isLoading}
                              >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Delete'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isLoading}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDeleteConfirm(orderId)}
                              disabled={isLoading}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
