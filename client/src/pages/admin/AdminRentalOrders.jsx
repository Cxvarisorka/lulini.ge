import { useState } from 'react';
import { Calendar, Clock, User, Phone, Mail, Car, Trash2, Check, X, MapPin, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useAdmin } from '../../context/AdminContext';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export function AdminRentalOrders() {
  const { rentalOrders, updateRentalOrder, deleteRentalOrder, getCarById, cityLocations } = useAdmin();
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filteredOrders = filterStatus === 'all'
    ? rentalOrders
    : rentalOrders.filter(order => order.status === filterStatus);

  const handleStatusChange = (orderId, newStatus) => {
    updateRentalOrder(orderId, { status: newStatus });
  };

  const handleDelete = (orderId) => {
    deleteRentalOrder(orderId);
    setDeleteConfirm(null);
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

  const getLocationName = (locationId) => {
    const loc = cityLocations.find(l => l.id === locationId);
    return loc?.name || locationId;
  };

  const pendingCount = rentalOrders.filter(o => o.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rental Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage car rental booking requests
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
        {['all', 'pending', 'confirmed', 'active', 'completed', 'cancelled'].map(status => (
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
                ({rentalOrders.filter(o => o.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {filterStatus === 'all'
                ? 'No rental orders yet.'
                : `No ${filterStatus} orders.`}
            </CardContent>
          </Card>
        ) : (
          filteredOrders.map(order => {
            const car = order.carId ? getCarById(order.carId) : null;

            return (
              <Card key={order.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{order.id}</CardTitle>
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
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Quick Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      {car?.image && (
                        <img
                          src={car.image}
                          alt={`${car.brand} ${car.model}`}
                          className="w-16 h-12 object-cover rounded-lg"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="text-sm">
                        <p className="text-muted-foreground">Vehicle</p>
                        <p className="font-medium">
                          {car ? `${car.brand} ${car.model}` : order.carName || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="text-muted-foreground">Rental Period</p>
                        <p className="font-medium">{order.startDate} - {order.endDate}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="text-muted-foreground">Pickup Location</p>
                        <p className="font-medium">{getLocationName(order.locationId)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedOrder === order.id && (
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

                        {/* Rental Details */}
                        <div className="space-y-3">
                          <h4 className="font-medium">Rental Details</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>{order.days} days rental</span>
                            </div>
                            {car && (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">Daily Rate:</span>
                                  <span>${car.pricePerDay}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">Deposit:</span>
                                  <span>${car.deposit}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pricing */}
                      <div className="bg-secondary/50 rounded-lg p-4">
                        <h4 className="font-medium mb-2">Pricing</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Daily Rate</p>
                            <p className="font-medium">${order.pricePerDay || car?.pricePerDay || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium">{order.days} days</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Price</p>
                            <p className="font-bold text-lg">${order.totalPrice}</p>
                          </div>
                        </div>
                      </div>

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
                              onClick={() => handleStatusChange(order.id, 'confirmed')}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(order.id, 'cancelled')}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(order.id, 'active')}
                          >
                            <Car className="h-4 w-4 mr-1" />
                            Mark Active
                          </Button>
                        )}
                        {order.status === 'active' && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(order.id, 'completed')}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Mark Completed
                          </Button>
                        )}
                        {deleteConfirm === order.id ? (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(order.id)}
                            >
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
                            onClick={() => setDeleteConfirm(order.id)}
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
            );
          })
        )}
      </div>
    </div>
  );
}
