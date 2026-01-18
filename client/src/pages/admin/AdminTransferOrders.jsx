import { useState, useEffect } from 'react';
import { MapPin, Calendar, Clock, User, Phone, Mail, Car, Trash2, Check, X, Eye, ChevronDown, Loader2 } from 'lucide-react';
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

export function AdminTransferOrders() {
  const { transferOrders, updateTransferOrderStatus, deleteTransferOrder, fetchTransferOrders, loadingTransfers } = useAdmin();
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Refresh transfers on mount
  useEffect(() => {
    fetchTransferOrders();
  }, []);

  const filteredOrders = filterStatus === 'all'
    ? transferOrders
    : transferOrders.filter(order => order.status === filterStatus);

  const handleStatusChange = async (orderId, newStatus) => {
    setActionLoading(orderId);
    try {
      await updateTransferOrderStatus(orderId, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (orderId) => {
    setActionLoading(orderId);
    try {
      await deleteTransferOrder(orderId);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete order:', error);
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

  const pendingCount = transferOrders.filter(o => o.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transfer Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage transfer booking requests
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === status
                ? 'bg-foreground text-background'
                : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
          >
            {status === 'all' ? 'All Orders' : statusLabels[status]}
            {status !== 'all' && (
              <span className="ml-1.5 opacity-70">
                ({transferOrders.filter(o => o.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {loadingTransfers ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading transfers...
            </CardContent>
          </Card>
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {filterStatus === 'all'
                ? 'No transfer orders yet.'
                : `No ${filterStatus} orders.`}
            </CardContent>
          </Card>
        ) : (
          filteredOrders.map(order => (
            <Card key={order._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">TR-{order._id.slice(-8).toUpperCase()}</CardTitle>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.status]}`}>
                      {statusLabels[order.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedOrder === order._id ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {/* Quick Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-muted-foreground">From</p>
                      <p className="font-medium">{order.pickupAddress || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-muted-foreground">To</p>
                      <p className="font-medium">{order.dropoffAddress || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-muted-foreground">Date & Time</p>
                      <p className="font-medium">{order.date} at {order.time}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedOrder === order._id && (
                  <div className="border-t pt-4 mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Customer Info */}
                      <div className="space-y-3">
                        <h4 className="font-medium">Customer Information</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{order.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${order.email}`} className="text-blue-600 hover:underline">
                              {order.email}
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${order.phone}`} className="text-blue-600 hover:underline">
                              {order.phone}
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Trip Details */}
                      <div className="space-y-3">
                        <h4 className="font-medium">Trip Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{order.vehicle}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{order.passengers} passengers, {order.luggage} luggage</span>
                          </div>
                          {order.flightNumber && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Flight:</span>
                              <span>{order.flightNumber}</span>
                            </div>
                          )}
                          {order.tripType === 'roundTrip' && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>Return: {order.returnDate} at {order.returnTime}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quote Info */}
                    {order.quote && (
                      <div className="bg-secondary/50 rounded-lg p-4">
                        <h4 className="font-medium mb-2">Quote</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Distance</p>
                            <p className="font-medium">{order.quote.distanceText}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium">{order.quote.durationText}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Price</p>
                            <p className="font-bold text-lg">${order.quote.totalPrice}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {order.notes && (
                      <div>
                        <h4 className="font-medium mb-2">Notes</h4>
                        <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                          {order.notes}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {order.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(order._id, 'confirmed')}
                            disabled={actionLoading === order._id}
                          >
                            {actionLoading === order._id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(order._id, 'cancelled')}
                            disabled={actionLoading === order._id}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      )}
                      {order.status === 'confirmed' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(order._id, 'completed')}
                          disabled={actionLoading === order._id}
                        >
                          {actionLoading === order._id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Mark Completed
                        </Button>
                      )}
                      {deleteConfirm === order._id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(order._id)}
                            disabled={actionLoading === order._id}
                          >
                            {actionLoading === order._id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : null}
                            Confirm Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(order._id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
