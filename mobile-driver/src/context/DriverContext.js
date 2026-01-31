import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { driverAPI, rideAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { useLocation } from './LocationContext';
import { useSocket } from './SocketContext';

const DriverContext = createContext();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

export const useDriver = () => {
  const context = useContext(DriverContext);
  if (!context) {
    throw new Error('useDriver must be used within DriverProvider');
  }
  return context;
};

export const DriverProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { startTracking, stopTracking, isTracking } = useLocation();
  const { socket } = useSocket();

  const [isOnline, setIsOnline] = useState(false);
  const [activeRides, setActiveRides] = useState([]);
  const [stats, setStats] = useState({
    earnings: 0,
    trips: 0,
    rating: 0,
    onlineTime: 0,
  });
  const [loading, setLoading] = useState(false);

  // Rides cache
  const ridesCache = useRef({
    allRides: [],
    timestamp: null,
    isValid: false,
  });
  const [cachedRides, setCachedRides] = useState([]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDriverStats();
      loadActiveRides();
    }
  }, [isAuthenticated]);

  // Invalidate rides cache
  const invalidateCache = useCallback(() => {
    console.log('Invalidating rides cache');
    ridesCache.current.isValid = false;
  }, []);

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    const { timestamp, isValid } = ridesCache.current;
    if (!isValid || !timestamp) return false;

    const now = Date.now();
    const isExpired = now - timestamp > CACHE_EXPIRATION_MS;
    return !isExpired;
  }, []);

  // Listen for real-time updates from socket
  useEffect(() => {
    if (!socket) return;

    // Handle ride completion event - update trips and earnings
    const handleRideCompleted = (data) => {
      console.log('Ride completed, updating stats:', data);
      if (data.updatedStats) {
        updateStats({
          trips: data.updatedStats.totalTrips,
          earnings: data.updatedStats.totalEarnings,
        });
      }
      // Remove from active rides if present
      if (data.rideId) {
        removeActiveRide(data.rideId);
      }
      // Invalidate cache when ride is completed
      invalidateCache();
    };

    // Handle ride review event - update rating
    const handleRideReviewed = (data) => {
      console.log('Ride reviewed, updating rating:', data);
      if (data.updatedStats) {
        updateStats({
          rating: data.updatedStats.rating,
        });
      }
    };

    // Handle new ride request - invalidate cache
    const handleNewRide = (data) => {
      console.log('New ride received, invalidating cache');
      invalidateCache();
    };

    // Handle ride cancelled - invalidate cache
    const handleRideCancelled = (data) => {
      console.log('Ride cancelled, invalidating cache');
      invalidateCache();
    };

    // Handle ride updated - invalidate cache
    const handleRideUpdated = (data) => {
      console.log('Ride updated, invalidating cache');
      invalidateCache();
    };

    socket.on('ride:completed', handleRideCompleted);
    socket.on('ride:reviewed', handleRideReviewed);
    socket.on('ride:request', handleNewRide);
    socket.on('ride:cancelled', handleRideCancelled);
    socket.on('ride:updated', handleRideUpdated);

    return () => {
      socket.off('ride:completed', handleRideCompleted);
      socket.off('ride:reviewed', handleRideReviewed);
      socket.off('ride:request', handleNewRide);
      socket.off('ride:cancelled', handleRideCancelled);
      socket.off('ride:updated', handleRideUpdated);
    };
  }, [socket, invalidateCache]);

  const loadDriverStats = async () => {
    try {
      const response = await driverAPI.getStats();
      if (response.data.success) {
        setStats(response.data.data.stats);

        // Sync online status with server
        const serverStatus = response.data.data.stats.status;
        const isDriverOnline = serverStatus === 'online' || serverStatus === 'busy';
        setIsOnline(isDriverOnline);

        // If driver is online on server, restart location tracking
        if (isDriverOnline && !isTracking) {
          startTracking();
        }
      }
    } catch (error) {
      console.log('Error loading driver stats:', error);
    }
  };

  // Load all rides with caching support
  const loadAllRides = useCallback(async (forceRefresh = false) => {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
      console.log('Using cached rides data');
      return { rides: ridesCache.current.allRides, fromCache: true };
    }

    console.log('Fetching fresh rides data from server');
    try {
      const response = await rideAPI.getMyRides('');
      if (response.data.success) {
        const allRides = response.data.data.rides || [];

        // Update cache
        ridesCache.current = {
          allRides,
          timestamp: Date.now(),
          isValid: true,
        };
        setCachedRides(allRides);

        // Also update active rides from the same data
        const active = allRides.filter(ride =>
          ['accepted', 'driver_arrived', 'in_progress'].includes(ride.status)
        );
        setActiveRides(active);

        return { rides: allRides, fromCache: false };
      }
      return { rides: [], fromCache: false };
    } catch (error) {
      console.log('Error loading rides:', error);
      // Return cached data on error if available
      if (ridesCache.current.allRides.length > 0) {
        console.log('Returning stale cache due to error');
        return { rides: ridesCache.current.allRides, fromCache: true };
      }
      throw error;
    }
  }, [isCacheValid]);

  const loadActiveRides = useCallback(async () => {
    try {
      // Use the cached load function
      const { rides } = await loadAllRides();
      // Filter for active ride statuses
      const active = rides.filter(ride =>
        ['accepted', 'driver_arrived', 'in_progress'].includes(ride.status)
      );
      setActiveRides(active);
    } catch (error) {
      console.log('Error loading active rides:', error);
    }
  }, [loadAllRides]);

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

  const updateStats = (newStats) => {
    setStats((prev) => ({ ...prev, ...newStats }));
  };

  const value = {
    isOnline,
    activeRides,
    cachedRides,
    stats,
    loading,
    goOnline,
    goOffline,
    addActiveRide,
    removeActiveRide,
    updateActiveRide,
    refreshStats,
    updateStats,
    loadActiveRides,
    loadAllRides,
    invalidateCache,
  };

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
};
