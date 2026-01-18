import React, { createContext, useState, useContext, useEffect } from 'react';
import { driverAPI, rideAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { useLocation } from './LocationContext';
import { useSocket } from './SocketContext';

const DriverContext = createContext();

export const useDriver = () => {
  const context = useContext(DriverContext);
  if (!context) {
    throw new Error('useDriver must be used within DriverProvider');
  }
  return context;
};

export const DriverProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { startTracking, stopTracking } = useLocation();
  const { emitEvent } = useSocket();

  const [isOnline, setIsOnline] = useState(false);
  const [activeRides, setActiveRides] = useState([]);
  const [stats, setStats] = useState({
    earnings: 0,
    trips: 0,
    rating: 0,
    onlineTime: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadDriverStats();
      loadActiveRides();
    }
  }, [isAuthenticated]);

  const loadDriverStats = async () => {
    try {
      const response = await driverAPI.getStats();
      if (response.data.success) {
        setStats(response.data.data.stats);
      }
    } catch (error) {
      console.log('Error loading driver stats:', error);
    }
  };

  const loadActiveRides = async () => {
    try {
      const response = await rideAPI.getMyRides('accepted,in_progress');
      if (response.data.success) {
        setActiveRides(response.data.data.rides || []);
      }
    } catch (error) {
      console.log('Error loading active rides:', error);
    }
  };

  const goOnline = async () => {
    try {
      setLoading(true);

      // Start location tracking
      const trackingStarted = await startTracking();
      if (!trackingStarted) {
        return {
          success: false,
          message: 'Cannot go online. Please enable location services and grant location permissions to continue.'
        };
      }

      // Update status on server
      const response = await driverAPI.updateStatus('online');
      if (response.data.success) {
        setIsOnline(true);

        // Emit socket event
        emitEvent('driver:online', { status: 'online' });

        return { success: true };
      }

      // If server update failed, stop tracking
      stopTracking();
      return { success: false, message: 'Failed to update status on server. Please try again.' };
    } catch (error) {
      console.log('Error going online:', error);
      // Make sure to stop tracking if there's an error
      stopTracking();
      return {
        success: false,
        message: error.message || 'Failed to go online. Please check your connection and try again.'
      };
    } finally {
      setLoading(false);
    }
  };

  const goOffline = async () => {
    try {
      setLoading(true);

      // Stop location tracking
      stopTracking();

      // Update status on server
      const response = await driverAPI.updateStatus('offline');
      if (response.data.success) {
        setIsOnline(false);

        // Emit socket event
        emitEvent('driver:offline', { status: 'offline' });

        return { success: true };
      }

      return { success: false, message: 'Failed to go offline' };
    } catch (error) {
      console.log('Error going offline:', error);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  const addActiveRide = (ride) => {
    setActiveRides((prev) => [...prev, ride]);
  };

  const removeActiveRide = (rideId) => {
    setActiveRides((prev) => prev.filter((ride) => ride._id !== rideId));
  };

  const updateActiveRide = (rideId, updates) => {
    setActiveRides((prev) =>
      prev.map((ride) => (ride._id === rideId ? { ...ride, ...updates } : ride))
    );
  };

  const refreshStats = async () => {
    await loadDriverStats();
  };

  const value = {
    isOnline,
    activeRides,
    stats,
    loading,
    goOnline,
    goOffline,
    addActiveRide,
    removeActiveRide,
    updateActiveRide,
    refreshStats,
    loadActiveRides,
  };

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
};
