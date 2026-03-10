import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Phone, X, MapPin, Car, CheckCircle } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { useSocket } from '../../context/SocketContext';

// Request browser notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, { body, icon: '/favicon.ico', requireInteraction: true });
      notif.onclick = () => { window.focus(); notif.close(); };
    } catch { /* ignore */ }
  }
}

function flashDocumentTitle(message) {
  const originalTitle = document.title;
  let flashing = true;
  const interval = setInterval(() => {
    document.title = flashing ? `⚠ ${message}` : originalTitle;
    flashing = !flashing;
  }, 1000);
  // Stop flashing when window gets focus
  const stop = () => {
    clearInterval(interval);
    document.title = originalTitle;
    window.removeEventListener('focus', stop);
  };
  window.addEventListener('focus', stop);
  // Auto-stop after 30s
  setTimeout(stop, 30000);
}

function AcceptedNotification({ ride, onDismiss }) {
  const driverName = ride.driver?.user?.name || ride.driver?.user?.firstName || 'Driver';
  const vehicle = ride.driver?.vehicle;

  return (
    <div className="bg-background border-2 border-green-400 rounded-xl shadow-2xl p-5 w-96 animate-in slide-in-from-top-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Driver Accepted</h3>
            <p className="text-xs text-muted-foreground">Driver is on the way</p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{ride.passengerName}</span>
        </div>
        {ride.passengerPhone && (
          <a
            href={`tel:${ride.passengerPhone}`}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center"
          >
            <Phone className="h-4 w-4" />
            Call {ride.passengerPhone}
          </a>
        )}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="truncate">{ride.pickup?.address}</span>
        </div>
        {vehicle && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Car className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{driverName} - {vehicle.make} {vehicle.model} ({vehicle.licensePlate})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ArrivalNotification({ ride, onDismiss }) {
  const driverName = ride.driver?.user?.name || ride.driver?.user?.firstName || 'Driver';
  const vehicle = ride.driver?.vehicle;

  return (
    <div className="bg-background border-2 border-yellow-400 rounded-xl shadow-2xl p-5 w-96 animate-in slide-in-from-top-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <Phone className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Driver Arrived</h3>
            <p className="text-xs text-muted-foreground">Call the passenger!</p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{ride.passengerName}</span>
        </div>
        {ride.passengerPhone && (
          <a
            href={`tel:${ride.passengerPhone}`}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center"
          >
            <Phone className="h-4 w-4" />
            Call {ride.passengerPhone}
          </a>
        )}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="truncate">{ride.pickup?.address}</span>
        </div>
        {vehicle && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Car className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{driverName} - {vehicle.make} {vehicle.model} ({vehicle.licensePlate})</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);

  const dismissNotification = useCallback((notifKey) => {
    setNotifications(prev => prev.filter(n => n.key !== notifKey));
  }, []);

  const addNotification = useCallback((ride, type) => {
    const rideId = ride._id || ride.id;
    const key = `${type}:${rideId}`;

    setNotifications(prev => {
      if (prev.some(n => n.key === key)) return prev;
      return [...prev, { ...ride, key, type }];
    });

    // Play notification sound
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}

    // Browser notification + title flash (works even when tab is in background)
    const passengerName = ride.passengerName || 'Passenger';
    if (type === 'arrived') {
      sendBrowserNotification('Driver Arrived!', `Call ${passengerName} — driver is at pickup`);
      flashDocumentTitle('Driver Arrived!');
    } else if (type === 'accepted') {
      sendBrowserNotification('Driver Accepted', `Driver is heading to ${passengerName}`);
      flashDocumentTitle('Driver Accepted');
    }

    // Auto-dismiss after 60 seconds
    setTimeout(() => dismissNotification(key), 60000);
  }, [dismissNotification]);

  useEffect(() => {
    if (!socket) return;

    const handleRideAccepted = (ride) => {
      console.log('[Admin] ride:accepted received', ride._id || ride.id, 'createdByAdmin:', ride.createdByAdmin);
      if (!ride.createdByAdmin) return;
      addNotification(ride, 'accepted');
    };

    const handleRideArrived = (ride) => {
      console.log('[Admin] ride:arrived received', ride._id || ride.id, 'createdByAdmin:', ride.createdByAdmin);
      if (!ride.createdByAdmin) return;
      // Dismiss the accepted notification for this ride when driver arrives
      const rideId = ride._id || ride.id;
      dismissNotification(`accepted:${rideId}`);
      addNotification(ride, 'arrived');
    };

    socket.on('ride:accepted', handleRideAccepted);
    socket.on('ride:arrived', handleRideArrived);
    return () => {
      socket.off('ride:accepted', handleRideAccepted);
      socket.off('ride:arrived', handleRideArrived);
    };
  }, [socket, addNotification, dismissNotification]);

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <AdminSidebar />
      <main className="flex-1 p-4 pt-20 lg:p-8 lg:pt-8 overflow-auto w-full">
        <Outlet />
      </main>

      {/* Arrival Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] space-y-3">
          {notifications.map((notif) => (
            notif.type === 'accepted' ? (
              <AcceptedNotification
                key={notif.key}
                ride={notif}
                onDismiss={() => dismissNotification(notif.key)}
              />
            ) : (
              <ArrivalNotification
                key={notif.key}
                ride={notif}
                onDismiss={() => dismissNotification(notif.key)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
