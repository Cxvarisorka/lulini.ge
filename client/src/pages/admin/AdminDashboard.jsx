import { Link } from 'react-router-dom';
import { Car, DollarSign, MapPin, CheckCircle, XCircle, ArrowRight, ClipboardList, FileText, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useAdmin } from '../../context/AdminContext';

export function AdminDashboard() {
  const { getStats, transferPricing, transferOrders, rentalOrders } = useAdmin();
  const stats = getStats();

  // Order statistics
  const pendingTransfers = transferOrders.filter(o => o.status === 'pending').length;
  const pendingRentals = rentalOrders.filter(o => o.status === 'pending').length;
  const totalPending = pendingTransfers + pendingRentals;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your car rental and transfer services
        </p>
      </div>

      {/* Order Stats */}
      {totalPending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-semibold text-yellow-800">You have {totalPending} pending order{totalPending !== 1 ? 's' : ''}</p>
              <p className="text-sm text-yellow-700">
                {pendingTransfers > 0 && `${pendingTransfers} transfer${pendingTransfers !== 1 ? 's' : ''}`}
                {pendingTransfers > 0 && pendingRentals > 0 && ' • '}
                {pendingRentals > 0 && `${pendingRentals} rental${pendingRentals !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {pendingTransfers > 0 && (
              <Link to="/admin/transfer-orders">
                <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100">
                  View Transfers
                </Button>
              </Link>
            )}
            {pendingRentals > 0 && (
              <Link to="/admin/rental-orders">
                <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100">
                  View Rentals
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transfer Orders
            </CardTitle>
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{transferOrders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingTransfers} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rental Orders
            </CardTitle>
            <FileText className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{rentalOrders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingRentals} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cars
            </CardTitle>
            <Car className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalCars}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.availableCars} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transfer Rate
            </CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${transferPricing.baseRatePerKm}/km</div>
            <p className="text-xs text-muted-foreground mt-1">
              Base pricing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cars by Category */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Cars by Category</CardTitle>
            <Link to="/admin/car-rentals">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.byCategory.map(cat => (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <Car className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="font-medium capitalize">{cat.label}</span>
                  </div>
                  <span className="text-2xl font-bold">{cat.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cars by Location */}
        <Card>
          <CardHeader>
            <CardTitle>Cars by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.byLocation.map(loc => (
                <div key={loc.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="font-medium">{loc.name}</span>
                  </div>
                  <span className="text-2xl font-bold">{loc.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transfer Pricing Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Transfer Pricing</CardTitle>
            <Link to="/admin/transfer-pricing">
              <Button variant="ghost" size="sm">
                Edit Pricing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-4 bg-secondary rounded-xl text-center">
                <p className="text-xs text-muted-foreground mb-1">Base Rate</p>
                <p className="text-xl font-bold">${transferPricing.baseRatePerKm}/km</p>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <p className="text-xs text-muted-foreground mb-1">Minimum</p>
                <p className="text-xl font-bold">${transferPricing.minimumCharge}</p>
              </div>
              {Object.entries(transferPricing.vehicleMultipliers).map(([vehicle, multiplier]) => (
                <div key={vehicle} className="p-4 bg-secondary rounded-xl text-center">
                  <p className="text-xs text-muted-foreground mb-1 capitalize">{vehicle}</p>
                  <p className="text-xl font-bold">{multiplier}x</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Link to="/admin/transfer-orders">
              <Button>
                <ClipboardList className="mr-2 h-4 w-4" />
                Transfer Orders
              </Button>
            </Link>
            <Link to="/admin/rental-orders">
              <Button>
                <FileText className="mr-2 h-4 w-4" />
                Rental Orders
              </Button>
            </Link>
            <Link to="/admin/car-rentals">
              <Button variant="outline">
                <Car className="mr-2 h-4 w-4" />
                Manage Cars
              </Button>
            </Link>
            <Link to="/admin/transfer-pricing">
              <Button variant="outline">
                <DollarSign className="mr-2 h-4 w-4" />
                Update Pricing
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
