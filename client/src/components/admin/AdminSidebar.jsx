import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Car, DollarSign, ArrowLeft, ClipboardList, FileText, Menu, X, MapIcon, Ticket, Users } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { cn } from '../../lib/utils';

export function AdminSidebar() {
  const location = useLocation();
  const { transferOrders, rentalOrders, tourOrders } = useAdmin();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const pendingTransfers = transferOrders.filter(o => o.status === 'pending').length;
  const pendingRentals = rentalOrders.filter(o => o.status === 'pending').length;
  const pendingTours = tourOrders.filter(o => o.status === 'pending').length;

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/transfer-orders', icon: ClipboardList, label: 'Transfer Orders', badge: pendingTransfers },
    { path: '/admin/rental-orders', icon: FileText, label: 'Rental Orders', badge: pendingRentals },
    { path: '/admin/tour-orders', icon: Ticket, label: 'Tour Bookings', badge: pendingTours },
    { path: '/admin/drivers', icon: Users, label: 'Drivers' },
    { path: '/admin/car-rentals', icon: Car, label: 'Car Rentals' },
    { path: '/admin/tours', icon: MapIcon, label: 'Tours' },
    { path: '/admin/transfer-pricing', icon: DollarSign, label: 'Transfer Pricing' },
  ];

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-foreground text-background h-16 flex items-center justify-between px-4">
        <Link to="/admin" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-background rounded-lg flex items-center justify-center">
            <span className="text-foreground font-bold text-lg">G</span>
          </div>
          <div>
            <span className="font-semibold block">GoTours</span>
            <span className="text-xs text-background/60">Admin</span>
          </div>
        </Link>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-background/10 transition-colors"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop always visible, Mobile slide-in */}
      <aside
        className={cn(
          "fixed lg:static z-50 bg-foreground text-background flex flex-col transition-transform duration-300",
          "w-64 min-h-screen",
          "lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0 top-16 h-[calc(100vh-4rem)]" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo - Desktop only */}
        <div className="hidden lg:block p-6 border-b border-background/10">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-background rounded-xl flex items-center justify-center">
              <span className="text-foreground font-bold text-xl">L</span>
            </div>
            <div>
              <span className="font-semibold text-lg block">GoTours</span>
              <span className="text-xs text-background/60">Admin Panel</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {navItems.map(({ path, icon: Icon, label, badge }) => (
              <li key={path}>
                <Link
                  to={path}
                  onClick={handleNavClick}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                    isActive(path)
                      ? 'bg-background text-foreground'
                      : 'text-background/70 hover:bg-background/10 hover:text-background'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{label}</span>
                  </div>
                  {badge > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500 text-yellow-900 rounded-full">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-background/10">
          <Link
            to="/"
            onClick={handleNavClick}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-background/70 hover:bg-background/10 hover:text-background transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">Back to Site</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
