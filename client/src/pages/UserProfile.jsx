import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Car,
  Plane,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  ChevronDown,
  Edit2,
  LogOut,
  Package,
  TrendingUp
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useUser } from '../context/UserContext';
import { useAdmin } from '../context/AdminContext';
import { cn } from '../lib/utils';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusIcons = {
  pending: Clock,
  confirmed: CheckCircle,
  active: Car,
  completed: CheckCircle,
  cancelled: XCircle
};

export function UserProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, updateProfile, isLoggedIn, getOrderStats } = useUser();
  const { transferOrders, rentalOrders, getCarById, cityLocations } = useAdmin();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || ''
  });

  // Get user's orders from admin context (matched by email)
  const userTransferOrders = transferOrders.filter(
    o => o.email?.toLowerCase() === user.email?.toLowerCase()
  );
  const userRentalOrders = rentalOrders.filter(
    o => o.email?.toLowerCase() === user.email?.toLowerCase()
  );

  const stats = {
    totalOrders: userTransferOrders.length + userRentalOrders.length,
    totalTransfers: userTransferOrders.length,
    totalRentals: userRentalOrders.length,
    completedTransfers: userTransferOrders.filter(o => o.status === 'completed').length,
    completedRentals: userRentalOrders.filter(o => o.status === 'completed').length,
    pendingOrders: userTransferOrders.filter(o => o.status === 'pending').length +
                   userRentalOrders.filter(o => o.status === 'pending').length,
    totalSpent: userTransferOrders.reduce((sum, o) => sum + (o.quote?.total || 0), 0) +
                userRentalOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
  };

  // Redirect if not logged in
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center pt-20">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold mb-2">{t('profile.signInToView')}</h2>
              <p className="text-muted-foreground mb-6">
                {t('profile.signInDescription')}
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate('/signin')}>
                  {t('profile.signIn')}
                </Button>
                <Button variant="outline" onClick={() => navigate('/signup')}>
                  {t('profile.createAccount')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const handleEditSave = () => {
    updateProfile(editForm);
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getLocationName = (locationId) => {
    const loc = cityLocations.find(l => l.id === locationId);
    return loc?.name || locationId;
  };

  const tabs = [
    { id: 'overview', label: t('profile.tabs.overview'), icon: TrendingUp },
    { id: 'transfers', label: t('profile.tabs.transfers'), icon: Plane, count: userTransferOrders.length },
    { id: 'rentals', label: t('profile.tabs.rentals'), icon: Car, count: userRentalOrders.length },
    { id: 'settings', label: t('profile.tabs.settings'), icon: User }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-secondary/30">
      <Header />

      <main className="flex-1 pt-20">
        {/* Profile Header */}
        <div className="bg-foreground text-background py-12">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-24 h-24 bg-background text-foreground rounded-full flex items-center justify-center text-3xl font-bold">
                {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-2xl md:text-3xl font-bold">{user.name || 'User'}</h1>
                <p className="text-background/70">{user.email}</p>
                {user.createdAt && (
                  <p className="text-sm text-background/50 mt-1">
                    {t('profile.memberSince')} {formatDate(user.createdAt)}
                  </p>
                )}
              </div>
              <div className="md:ml-auto flex gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('settings')}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  {t('profile.editProfile')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-background/20 text-background hover:bg-background/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('profile.signOut')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b bg-background sticky top-16 z-10">
          <div className="container mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors",
                      activeTab === tab.id
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="px-2 py-0.5 bg-secondary rounded-full text-xs">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="container mx-auto px-4 py-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.totalOrders}</p>
                        <p className="text-sm text-muted-foreground">{t('profile.stats.totalOrders')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.completedTransfers + stats.completedRentals}</p>
                        <p className="text-sm text-muted-foreground">{t('profile.stats.completed')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.pendingOrders}</p>
                        <p className="text-sm text-muted-foreground">{t('profile.stats.pending')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">${stats.totalSpent}</p>
                        <p className="text-sm text-muted-foreground">{t('profile.stats.totalSpent')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Transfers */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Plane className="w-5 h-5" />
                      {t('profile.recentTransfers')}
                    </CardTitle>
                    {userTransferOrders.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('transfers')}>
                        {t('profile.viewAll')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {userTransferOrders.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">{t('profile.noTransferOrders')}</p>
                    ) : (
                      <div className="space-y-3">
                        {userTransferOrders.slice(0, 3).map(order => (
                          <div key={order.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center">
                                <Plane className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{order.pickup?.split(',')[0]}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(order.date)}</p>
                              </div>
                            </div>
                            <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[order.status])}>
                              {t(`profile.status.${order.status}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Rentals */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Car className="w-5 h-5" />
                      {t('profile.recentRentals')}
                    </CardTitle>
                    {userRentalOrders.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('rentals')}>
                        {t('profile.viewAll')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {userRentalOrders.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">{t('profile.noRentalOrders')}</p>
                    ) : (
                      <div className="space-y-3">
                        {userRentalOrders.slice(0, 3).map(order => {
                          const car = getCarById(order.carId);
                          return (
                            <div key={order.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center">
                                  <Car className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{car ? `${car.brand} ${car.model}` : order.carName}</p>
                                  <p className="text-xs text-muted-foreground">{order.startDate} - {order.endDate}</p>
                                </div>
                              </div>
                              <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[order.status])}>
                                {t(`profile.status.${order.status}`)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('profile.quickActions')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => navigate('/transfers')}>
                      <Plane className="w-4 h-4 mr-2" />
                      {t('profile.bookTransfer')}
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/car-rentals')}>
                      <Car className="w-4 h-4 mr-2" />
                      {t('profile.rentACar')}
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/contact')}>
                      <Mail className="w-4 h-4 mr-2" />
                      {t('profile.contactSupport')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Transfer Orders Tab */}
          {activeTab === 'transfers' && (
            <TransferOrdersList orders={userTransferOrders} formatDate={formatDate} t={t} />
          )}

          {/* Rental Orders Tab */}
          {activeTab === 'rentals' && (
            <RentalOrdersList
              orders={userRentalOrders}
              formatDate={formatDate}
              getCarById={getCarById}
              getLocationName={getLocationName}
              t={t}
            />
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>{t('profile.settings.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('profile.settings.fullName')}</Label>
                    <Input
                      id="name"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t('profile.settings.namePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('profile.settings.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder={t('profile.settings.emailPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('profile.settings.phone')}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder={t('profile.settings.phonePlaceholder')}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleEditSave}>
                    {t('profile.settings.saveChanges')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditForm({
                      name: user.name || '',
                      email: user.email || '',
                      phone: user.phone || ''
                    })}
                  >
                    {t('profile.settings.reset')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Transfer Orders List Component
function TransferOrdersList({ orders, formatDate, t }) {
  const [expandedOrder, setExpandedOrder] = useState(null);

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Plane className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('profile.noTransfers.title')}</h3>
          <p className="text-muted-foreground mb-4">{t('profile.noTransfers.description')}</p>
          <Button onClick={() => window.location.href = '/transfers'}>
            {t('profile.noTransfers.cta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map(order => {
        const StatusIcon = statusIcons[order.status] || Clock;
        const isExpanded = expandedOrder === order.id;

        return (
          <Card key={order.id}>
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center">
                    <Plane className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold">{order.pickup?.split(',')[0]} → {order.dropoff?.split(',')[0]}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(order.date)} at {order.time} • {order.tripType === 'roundTrip' ? t('profile.roundTrip') : t('profile.oneWay')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("px-3 py-1 rounded-full text-sm font-medium", statusColors[order.status])}>
                    <StatusIcon className="w-3 h-3 inline mr-1" />
                    {t(`profile.status.${order.status}`)}
                  </span>
                  <ChevronDown className={cn("w-5 h-5 transition-transform", isExpanded && "rotate-180")} />
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.tripDetails')}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-green-600 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">{t('profile.pickup')}</p>
                            <p>{order.pickup}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">{t('profile.dropoff')}</p>
                            <p>{order.dropoff}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.bookingInfo')}</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">{t('profile.orderId')}:</span> {order.id}</p>
                        <p><span className="text-muted-foreground">{t('profile.vehicle')}:</span> {order.quote?.vehicleType || 'Standard'}</p>
                        <p><span className="text-muted-foreground">{t('profile.passengers')}:</span> {order.passengers}</p>
                        {order.quote && (
                          <p className="text-lg font-bold mt-2">${order.quote.total}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Rental Orders List Component
function RentalOrdersList({ orders, formatDate, getCarById, getLocationName, t }) {
  const [expandedOrder, setExpandedOrder] = useState(null);

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Car className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('profile.noRentals.title')}</h3>
          <p className="text-muted-foreground mb-4">{t('profile.noRentals.description')}</p>
          <Button onClick={() => window.location.href = '/car-rentals'}>
            {t('profile.noRentals.cta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map(order => {
        const car = getCarById(order.carId);
        const StatusIcon = statusIcons[order.status] || Clock;
        const isExpanded = expandedOrder === order.id;

        return (
          <Card key={order.id}>
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
              >
                <div className="flex items-center gap-4">
                  {car?.image ? (
                    <img
                      src={car.image}
                      alt={`${car.brand} ${car.model}`}
                      className="w-16 h-12 object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-12 bg-secondary rounded-lg flex items-center justify-center">
                      <Car className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">{car ? `${car.brand} ${car.model}` : order.carName}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.startDate} → {order.endDate} • {order.days} {t('profile.days')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("px-3 py-1 rounded-full text-sm font-medium", statusColors[order.status])}>
                    <StatusIcon className="w-3 h-3 inline mr-1" />
                    {t(`profile.status.${order.status}`)}
                  </span>
                  <ChevronDown className={cn("w-5 h-5 transition-transform", isExpanded && "rotate-180")} />
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.rentalDetails')}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">{t('profile.pickupLocation')}</p>
                            <p>{getLocationName(order.locationId)}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">{t('profile.rentalPeriod')}</p>
                            <p>{order.startDate} to {order.endDate}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.pricing')}</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">{t('profile.orderId')}:</span> {order.id}</p>
                        <p><span className="text-muted-foreground">{t('profile.dailyRate')}:</span> ${order.pricePerDay}</p>
                        <p><span className="text-muted-foreground">{t('profile.duration')}:</span> {order.days} {t('profile.days')}</p>
                        <p className="text-lg font-bold mt-2">${order.totalPrice}</p>
                      </div>
                    </div>
                  </div>
                  {order.notes && (
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.notes')}</h4>
                      <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">{order.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
