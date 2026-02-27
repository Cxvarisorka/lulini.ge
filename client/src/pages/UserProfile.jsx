import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Edit2,
  LogOut,
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
import { cn } from '../lib/utils';

export function UserProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, updateProfile, isLoggedIn } = useUser();
  const scrollRef = useScrollAnimation();
  const [activeTab, setActiveTab] = useState('overview');
  const [editForm, setEditForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || ''
  });

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

  const tabs = [
    { id: 'overview', label: t('profile.tabs.overview'), icon: TrendingUp },
    { id: 'settings', label: t('profile.tabs.settings'), icon: User }
  ];

  return (
    <div ref={scrollRef} className="min-h-screen flex flex-col bg-background">
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
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar - Profile Card */}
            <div className="anim-ready anim-fade-left anim-duration-400 hidden lg:block lg:col-span-3">
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
            <div className="anim-ready anim-fade-up anim-duration-400 anim-delay-1 lg:col-span-9">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Welcome Section */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-semibold truncate">{t('profile.welcome')}, {user.name?.split(' ')[0] || 'User'}!</h1>
                  <p className="text-sm sm:text-base text-muted-foreground">{t('profile.overviewDescription')}</p>
                </div>
              </div>

              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium mb-1">{t('profile.welcome')}</h3>
                  <p className="text-sm text-muted-foreground">{t('profile.overviewDescription')}</p>
                </CardContent>
              </Card>
            </div>
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
