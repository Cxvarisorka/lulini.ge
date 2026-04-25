import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { Home } from './pages/Home';
import { Contact } from './pages/Contact';
import { Careers } from './pages/Careers';
import { Privacy } from './pages/Privacy';
import { SharedRide } from './pages/SharedRide';
import { TrackRedirect } from './pages/TrackRedirect';
import { Terms } from './pages/Terms';
import { SignIn } from './pages/SignIn';
import { Support } from './pages/Support';
import { UserProfile } from './pages/UserProfile';
import { AdminProvider } from './context/AdminContext';
import { UserProvider } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminRides } from './pages/admin/AdminRides';
import AdminDrivers from './pages/admin/AdminDrivers';
import AdminDriverInfo from './pages/admin/AdminDriverInfo';
import { AdminPricing } from './pages/admin/AdminPricing';
import { AdminCreateRide } from './pages/admin/AdminCreateRide';
import { AdminCostMetrics } from './pages/admin/AdminCostMetrics';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TawkTo } from './components/TawkTo';
import './i18n';

const libraries = ['places'];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppContent() {
  return (
    <UserProvider>
      <SocketProvider>
        <AdminProvider>
          <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/ride/shared/:token" element={<SharedRide />} />
            <Route path="/track/:rideId" element={<TrackRedirect />} />
            <Route path="/support" element={<Support />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />

            {/* Admin Routes - Protected */}
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="rides" element={<AdminRides />} />
              <Route path="drivers" element={<AdminDrivers />} />
              <Route path="drivers/:id" element={<AdminDriverInfo />} />
              <Route path="pricing" element={<AdminPricing />} />
              <Route path="create-ride" element={<AdminCreateRide />} />
              <Route path="cost-metrics" element={<AdminCostMetrics />} />
            </Route>
          </Routes>
        </BrowserRouter>
          {/* Tawk.to Live Chat Widget */}
          <TawkTo />
          {/* Vercel Web Analytics */}
          <Analytics />
          {/* Vercel Speed Insights */}
          <SpeedInsights />
        </AdminProvider>
      </SocketProvider>
    </UserProvider>
  );
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    const handleLangChange = (lng) => { document.documentElement.lang = lng; };
    i18n.on('languageChanged', handleLangChange);
    return () => i18n.off('languageChanged', handleLangChange);
  }, [i18n]);

  return <AppContent />;
}

export default App;
