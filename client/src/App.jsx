import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { Home } from './pages/Home';
import { Transfers } from './pages/Transfers';
import { CarRentals } from './pages/CarRentals';
import { CarRentalDetail } from './pages/CarRentalDetail';
import { Tours } from './pages/Tours';
import { TourDetail } from './pages/TourDetail';
import { Contact } from './pages/Contact';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { UserProfile } from './pages/UserProfile';
import { AdminProvider } from './context/AdminContext';
import { UserProvider } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminCarRentals } from './pages/admin/AdminCarRentals';
import { AdminTours } from './pages/admin/AdminTours';
import { AdminTransferPricing } from './pages/admin/AdminTransferPricing';
import { AdminTransferOrders } from './pages/admin/AdminTransferOrders';
import { AdminRentalOrders } from './pages/admin/AdminRentalOrders';
import { AdminTourOrders } from './pages/admin/AdminTourOrders';
import AdminDrivers from './pages/admin/AdminDrivers';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TawkTo } from './components/TawkTo';
import './i18n';

const libraries = ['places'];

function AppContent() {
  return (
    <UserProvider>
      <SocketProvider>
        <AdminProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/car-rentals" element={<CarRentals />} />
            <Route path="/car-rentals/:carId" element={<CarRentalDetail />} />
            <Route path="/tours" element={<Tours />} />
            <Route path="/tours/:tourId" element={<TourDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />

            {/* Admin Routes - Protected */}
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="transfer-orders" element={<AdminTransferOrders />} />
              <Route path="rental-orders" element={<AdminRentalOrders />} />
              <Route path="tour-orders" element={<AdminTourOrders />} />
              <Route path="drivers" element={<AdminDrivers />} />
              <Route path="car-rentals" element={<AdminCarRentals />} />
              <Route path="tours" element={<AdminTours />} />
              <Route path="transfer-pricing" element={<AdminTransferPricing />} />
            </Route>
          </Routes>
        </BrowserRouter>
          {/* Tawk.to Live Chat Widget */}
          <TawkTo />
        </AdminProvider>
      </SocketProvider>
    </UserProvider>
  );
}

function App() {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey,
    libraries,
  });

  if (!googleMapsApiKey) {
    console.warn('Google Maps API key is not set. Location autocomplete will not work.');
    return <AppContent />;
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return <AppContent />;
}

export default App;
