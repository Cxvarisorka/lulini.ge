import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useUser } from '../context/UserContext';
import { useAdmin } from '../context/AdminContext';
import { useSocket } from '../context/SocketContext';
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
  const { user, logout, updateProfile, isLoggedIn, getUserTransferOrders, getUserRentalOrders, fetchUserTransfers } = useUser();
  const { rentalOrders, getCarById, cityLocations } = useAdmin();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || ''
  });

  // Listen for real-time transfer updates
  useEffect(() => {
    if (!socket) return;

    const handleTransferUpdated = (transfer) => {
      console.log('Real-time: User transfer updated', transfer._id);
      // Refresh user transfers to get the updated data
      fetchUserTransfers();
    };

    const handleTransferDeleted = ({ _id }) => {
      console.log('Real-time: User transfer deleted', _id);
      // Refresh user transfers
      fetchUserTransfers();
    };

    socket.on('transfer:updated', handleTransferUpdated);
    socket.on('transfer:deleted', handleTransferDeleted);

    return () => {
      socket.off('transfer:updated', handleTransferUpdated);
      socket.off('transfer:deleted', handleTransferDeleted);
    };
  }, [socket, fetchUserTransfers]);

  // Get user's transfer orders from UserContext (fetched from API)
  const userTransferOrders = getUserTransferOrders();

  // Get user's rental orders from AdminContext (still local for now)
  const userRentalOrders = rentalOrders.filter(
    o => o.email?.toLowerCase() === user.email?.toLowerCase() || o.userId === user.id
  );

  const stats = {
    totalOrders: userTransferOrders.length + userRentalOrders.length,
    totalTransfers: userTransferOrders.length,
    totalRentals: userRentalOrders.length,
    completedTransfers: userTransferOrders.filter(o => o.status === 'completed').length,
    completedRentals: userRentalOrders.filter(o => o.status === 'completed').length,
    pendingOrders: userTransferOrders.filter(o => o.status === 'pending').length +
                   userRentalOrders.filter(o => o.status === 'pending').length,
    totalSpent: userTransferOrders.reduce((sum, o) => sum + (o.quote?.totalPrice || o.quote?.total || 0), 0) +
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
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-20">
        {/* Mobile Profile Header */}
        <div className="lg:hidden sticky top-16 z-10 bg-background pb-4">
          <div className="container mx-auto px-4">
            <div className="bg-secondary/50 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-lg flex-shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{user.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveTab('settings')}
                className="flex-shrink-0"
              >
                <User className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Mobile Navigation Dropdown */}
          <div className="lg:hidden mb-6">
            <Label htmlFor="section-select" className="text-sm font-medium mb-2 block">
              {t('profile.navigateTo') || 'Navigate to:'}
            </Label>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="h-12 text-base" id="section-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id} className="h-12 text-base">
                      <div className="flex items-center gap-2 w-full">
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            ({tab.count})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar - Profile Card */}
            <div className="hidden lg:block lg:col-span-3">
              <div className="sticky top-24 space-y-4">
                {/* Profile Card */}
                <Card className="overflow-hidden">
                  <div className="h-20 bg-gradient-to-br from-primary/80 to-primary" />
                  <CardContent className="pt-0 -mt-10 text-center">
                    <div className="w-20 h-20 mx-auto bg-background border-4 border-background rounded-full flex items-center justify-center text-2xl font-bold shadow-lg">
                      {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold">{user.name || 'User'}</h2>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    {user.createdAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('profile.memberSince')} {formatDate(user.createdAt)}
                      </p>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setActiveTab('settings')}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        {t('profile.editProfile')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Navigation */}
                <Card>
                  <CardContent className="p-2">
                    <nav className="space-y-1">
                      {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                              activeTab === tab.id
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}
                          >
                            <span className="flex items-center gap-3">
                              <Icon className="w-4 h-4" />
                              {tab.label}
                            </span>
                            {tab.count !== undefined && tab.count > 0 && (
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs",
                                activeTab === tab.id
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-secondary text-muted-foreground"
                              )}>
                                {tab.count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </nav>
                  </CardContent>
                </Card>

                {/* Sign Out Button */}
                <Button
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('profile.signOut')}
                </Button>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-9">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Welcome Section */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-semibold truncate">{t('profile.welcome')}, {user.name?.split(' ')[0] || 'User'}!</h1>
                  <p className="text-sm sm:text-base text-muted-foreground">{t('profile.overviewDescription')}</p>
                </div>
                <div className="hidden sm:flex gap-2 flex-shrink-0">
                  <Button onClick={() => navigate('/transfers')} className="whitespace-nowrap">
                    <Plane className="w-4 h-4 mr-2" />
                    {t('profile.bookTransfer')}
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/car-rentals')} className="whitespace-nowrap">
                    <Car className="w-4 h-4 mr-2" />
                    {t('profile.rentACar')}
                  </Button>
                </div>
              </div>

              {/* Stats Grid - Modern Compact Design */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                      </div>
                      <p className="text-xs sm:text-sm text-blue-600/70 truncate">{t('profile.stats.totalOrders')}</p>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-700">{stats.totalOrders}</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                      </div>
                      <p className="text-xs sm:text-sm text-emerald-600/70 truncate">{t('profile.stats.completed')}</p>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-700">{stats.completedTransfers + stats.completedRentals}</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                      </div>
                      <p className="text-xs sm:text-sm text-amber-600/70 truncate">{t('profile.stats.pending')}</p>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-amber-700">{stats.pendingOrders}</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-violet-100/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
                      </div>
                      <p className="text-xs sm:text-sm text-violet-600/70 truncate">{t('profile.stats.totalSpent')}</p>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-violet-700">${stats.totalSpent}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity - Combined Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{t('profile.recentActivity')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {userTransferOrders.length === 0 && userRentalOrders.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-medium mb-1">{t('profile.noOrders.title')}</h3>
                      <p className="text-sm text-muted-foreground mb-4">{t('profile.noOrders.description')}</p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" onClick={() => navigate('/transfers')}>
                          {t('profile.bookTransfer')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate('/car-rentals')}>
                          {t('profile.rentACar')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Transfers */}
                      {userTransferOrders.slice(0, 3).map(order => (
                        <div key={order._id || order.id} className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors group cursor-pointer" onClick={() => setActiveTab('transfers')}>
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Plane className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {order.pickupAddress?.split(',')[0] || order.pickup?.address?.split(',')[0] || 'Transfer'} → {order.dropoffAddress?.split(',')[0] || order.dropoff?.address?.split(',')[0] || ''}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{formatDate(order.date)} • {order.tripType === 'roundTrip' ? t('profile.roundTrip') : t('profile.oneWay')}</p>
                          </div>
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap", statusColors[order.status])}>
                            <span className="hidden sm:inline">{t(`profile.status.${order.status}`)}</span>
                            <span className="sm:hidden">{t(`profile.status.${order.status}`).substring(0, 4)}</span>
                          </span>
                        </div>
                      ))}
                      {/* Rentals */}
                      {userRentalOrders.slice(0, 3).map(order => {
                        const car = getCarById(order.carId);
                        return (
                          <div key={order.id} className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors group cursor-pointer" onClick={() => setActiveTab('rentals')}>
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <Car className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{car ? `${car.brand} ${car.model}` : order.carName}</p>
                              <p className="text-xs text-muted-foreground truncate">{order.startDate} - {order.endDate} • {order.days} {t('profile.days')}</p>
                            </div>
                            <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap", statusColors[order.status])}>
                              <span className="hidden sm:inline">{t(`profile.status.${order.status}`)}</span>
                              <span className="sm:hidden">{t(`profile.status.${order.status}`).substring(0, 4)}</span>
                            </span>
                          </div>
                        );
                      })}
                      {(userTransferOrders.length > 3 || userRentalOrders.length > 3) && (
                        <div className="pt-2 flex gap-2 justify-center">
                          {userTransferOrders.length > 3 && (
                            <Button variant="ghost" size="sm" onClick={() => setActiveTab('transfers')}>
                              {t('profile.viewAllTransfers')}
                            </Button>
                          )}
                          {userRentalOrders.length > 3 && (
                            <Button variant="ghost" size="sm" onClick={() => setActiveTab('rentals')}>
                              {t('profile.viewAllRentals')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Mobile Quick Actions */}
              <div className="sm:hidden flex gap-2">
                <Button className="flex-1" onClick={() => navigate('/transfers')}>
                  <Plane className="w-4 h-4 mr-2" />
                  {t('profile.bookTransfer')}
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => navigate('/car-rentals')}>
                  <Car className="w-4 h-4 mr-2" />
                  {t('profile.rentACar')}
                </Button>
              </div>
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
          </div>
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
        const orderId = order._id || order.id;
        const isExpanded = expandedOrder === orderId;
        const pickupDisplay = order.pickupAddress || order.pickup?.address || 'N/A';
        const dropoffDisplay = order.dropoffAddress || order.dropoff?.address || 'N/A';

        return (
          <Card key={orderId}>
            <CardContent className="p-4">
              <div
                className="flex items-start sm:items-center justify-between cursor-pointer gap-3"
                onClick={() => setExpandedOrder(isExpanded ? null : orderId)}
              >
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Plane className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base truncate">{pickupDisplay.split(',')[0]} → {dropoffDisplay.split(',')[0]}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {formatDate(order.date)} at {order.time} • {order.tripType === 'roundTrip' ? t('profile.roundTrip') : t('profile.oneWay')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <span className={cn("px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap flex items-center gap-1", statusColors[order.status])}>
                    <StatusIcon className="w-3 h-3" />
                    <span>{t(`profile.status.${order.status}`)}</span>
                  </span>
                  <ChevronDown className={cn("w-5 h-5 transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
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
                            <p>{pickupDisplay}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">{t('profile.dropoff')}</p>
                            <p>{dropoffDisplay}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">{t('profile.bookingInfo')}</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">{t('profile.orderId')}:</span> {orderId?.slice?.(-8)?.toUpperCase() || orderId}</p>
                        <p><span className="text-muted-foreground">{t('profile.vehicle')}:</span> {order.vehicle || order.quote?.vehicleType || 'Standard'}</p>
                        <p><span className="text-muted-foreground">{t('profile.passengers')}:</span> {order.passengers}</p>
                        {order.quote && (
                          <p className="text-lg font-bold mt-2">${order.quote.totalPrice || order.quote.total}</p>
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
  const [expandedRentalOrder, setExpandedRentalOrder] = useState(null);

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
        const isExpanded = expandedRentalOrder === order.id;

        return (
          <Card key={order.id}>
            <CardContent className="p-4">
              <div
                className="flex items-start sm:items-center justify-between cursor-pointer gap-3"
                onClick={() => setExpandedRentalOrder(isExpanded ? null : order.id)}
              >
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  {car?.image ? (
                    <img
                      src={car.image}
                      alt={`${car.brand} ${car.model}`}
                      className="w-12 h-10 sm:w-16 sm:h-12 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-12 h-10 sm:w-16 sm:h-12 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                      <Car className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base truncate">{car ? `${car.brand} ${car.model}` : order.carName}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {order.startDate} → {order.endDate} • {order.days} {t('profile.days')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <span className={cn("px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap flex items-center gap-1", statusColors[order.status])}>
                    <StatusIcon className="w-3 h-3" />
                    <span>{t(`profile.status.${order.status}`)}</span>
                  </span>
                  <ChevronDown className={cn("w-5 h-5 transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
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
