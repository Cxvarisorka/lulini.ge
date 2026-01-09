import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoadScript } from '@react-google-maps/api';
import { Home } from './pages/Home';
import { Transfers } from './pages/Transfers';
import { CarRentals } from './pages/CarRentals';
import { CarRentalDetail } from './pages/CarRentalDetail';
import { Contact } from './pages/Contact';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { UserProfile } from './pages/UserProfile';
import { AdminProvider } from './context/AdminContext';
import { UserProvider } from './context/UserContext';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminCarRentals } from './pages/admin/AdminCarRentals';
import { AdminTransferPricing } from './pages/admin/AdminTransferPricing';
import { AdminTransferOrders } from './pages/admin/AdminTransferOrders';
import { AdminRentalOrders } from './pages/admin/AdminRentalOrders';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TawkTo } from './components/TawkTo';
import './i18n';

const libraries = ['places'];

function AppContent() {
  return (
    <UserProvider>
      <AdminProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/car-rentals" element={<CarRentals />} />
            <Route path="/car-rentals/:carId" element={<CarRentalDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />

            {/* Admin Routes - Protected */}
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="transfer-orders" element={<AdminTransferOrders />} />
              <Route path="rental-orders" element={<AdminRentalOrders />} />
              <Route path="car-rentals" element={<AdminCarRentals />} />
              <Route path="transfer-pricing" element={<AdminTransferPricing />} />
            </Route>
          </Routes>
        </BrowserRouter>
        {/* Tawk.to Live Chat Widget */}
        <TawkTo />
      </AdminProvider>
    </UserProvider>
  );
}

function App() {
  // Note: Replace with your own Google Maps API key
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!googleMapsApiKey) {
    console.warn('Google Maps API key is not set. Location autocomplete will not work.');
    return <AppContent />;
  }

  return (
    <LoadScript
      googleMapsApiKey={googleMapsApiKey}
      libraries={libraries}
      loadingElement={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent" />
        </div>
      }
    >
      <AppContent />
    </LoadScript>
  );
}

export default App;
