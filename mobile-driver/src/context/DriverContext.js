import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { driverAPI, rideAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { useLocation } from './LocationContext';
import { useSocket } from './SocketContext';

const DriverContext = createContext();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;
const STORAGE_KEY = '@driver_rides_cache';
const EARNINGS_STORAGE_KEY = '@driver_earnings_cache';
const PAGE_SIZE = 20;

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
  const { socket, setDriverOnlineStatus } = useSocket();

  const [isOnline, setIsOnline] = useState(false);
  const [activeRides, setActiveRides] = useState([]);
  const [stats, setStats] = useState({
    earnings: 0,
    trips: 0,
    rating: 0,
    onlineTime: 0,
  });
  const [loading, setLoading] = useState(false);

  // Rides cache (in-memory)
  const ridesCache = useRef({
    allRides: [],
    timestamp: null,
    isValid: false,
  });
  const [cachedRides, setCachedRides] = useState([]);

  // Earnings cache (in-memory, keyed by period)
  const earningsCache = useRef({});  // { today: { data, timestamp }, week: { ... }, month: { ... } }

  // Pagination state
  const paginationMeta = useRef({ page: 0, pages: 1, hasMore: true });
  const [hasMoreRides, setHasMoreRides] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      loadDriverStats();
      loadActiveRides();
    }
  }, [isAuthenticated]);

  // Invalidate rides cache
  const invalidateCache = useCallback(() => {
    ridesCache.current.isValid = false;
    paginationMeta.current = { page: 0, pages: 1, hasMore: true };
    setHasMoreRides(true);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  // Invalidate earnings cache (all periods)
  const invalidateEarningsCache = useCallback(() => {
    earningsCache.current = {};
    AsyncStorage.removeItem(EARNINGS_STORAGE_KEY).catch(() => {});
  }, []);

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    const { timestamp, isValid } = ridesCache.current;
    if (!isValid || !timestamp) return false;

    const now = Date.now();
    const isExpired = now - timestamp > CACHE_EXPIRATION_MS;
    return !isExpired;
  }, []);

  // Load earnings with caching (per period)
  const loadEarnings = useCallback(async (period = 'today', forceRefresh = false) => {
    const cached = earningsCache.current[period];

    // Return cached data if valid
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_EXPIRATION_MS)) {
      return { earnings: cached.data, fromCache: true };
    }

    // Try AsyncStorage on cold start
    if (!forceRefresh && !cached) {
      try {
        const raw = await AsyncStorage.getItem(EARNINGS_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored[period] && (Date.now() - stored[period].timestamp < CACHE_EXPIRATION_MS)) {
            earningsCache.current[period] = stored[period];
            return { earnings: stored[period].data, fromCache: true };
          }
        }
      } catch {}
    }

    // Fetch from server
    const response = await driverAPI.getEarnings(period);
    if (response.data.success) {
      const data = response.data.data.earnings;
      earningsCache.current[period] = { data, timestamp: Date.now() };

      // Persist all cached periods to AsyncStorage
      AsyncStorage.setItem(EARNINGS_STORAGE_KEY, JSON.stringify(earningsCache.current)).catch(() => {});

      return { earnings: data, fromCache: false };
    }

    return { earnings: { total: 0, trips: 0, average: 0 }, fromCache: false };
  }, []);

  // Listen for real-time updates from socket
  useEffect(() => {
    if (!socket) return;

    // Handle ride completion event - update trips and earnings
    const handleRideCompleted = (data) => {
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
      // Invalidate caches when ride is completed
      invalidateCache();
      invalidateEarningsCache();
    };

    // Handle ride review event - update rating
    const handleRideReviewed = (data) => {
      if (data.updatedStats) {
        updateStats({
          rating: data.updatedStats.rating,
        });
      }
    };

    // Handle new ride request - invalidate cache
    const handleNewRide = () => {
      invalidateCache();
    };

    // Handle ride cancelled - remove from active rides and invalidate cache
    const handleRideCancelled = (ride) => {
      const rideId = ride?._id || ride?.rideId;
      if (rideId) {
        removeActiveRide(rideId);
      }
      invalidateCache();
    };

    // Handle ride updated - invalidate cache
    const handleRideUpdated = () => {
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
  }, [socket, invalidateCache, invalidateEarningsCache]);

  const loadDriverStats = async () => {
    try {
      const response = await driverAPI.getStats();
      if (response.data.success) {
        setStats(response.data.data.stats);

        // Sync online status with server
        const serverStatus = response.data.data.stats.status;
        const driverOnline = serverStatus === 'online' || serverStatus === 'busy';
        setIsOnline(driverOnline);
        setDriverOnlineStatus(driverOnline);

        // If driver is online on server, restart location tracking
        if (driverOnline && !isTracking) {
          startTracking();
        }
      }
    } catch (error) {
      // Failed to load driver stats
    }
  };

  // Load rides page 1 with caching support
  const loadAllRides = useCallback(async (forceRefresh = false) => {
    // Return in-memory cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
      return { rides: ridesCache.current.allRides, fromCache: true };
    }

    // Try AsyncStorage cache on first load (not force refresh)
    if (!forceRefresh && !ridesCache.current.isValid) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached.rides?.length && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
            ridesCache.current = {
              allRides: cached.rides,
              timestamp: cached.timestamp,
              isValid: true,
            };
            setCachedRides(cached.rides);
            paginationMeta.current = {
              page: cached.page || 1,
              pages: cached.pages || 1,
              hasMore: (cached.page || 1) < (cached.pages || 1),
            };
            setHasMoreRides(paginationMeta.current.hasMore);

            const active = cached.rides.filter(ride =>
              ['accepted', 'driver_arrived', 'in_progress'].includes(ride.status)
            );
            setActiveRides(active);

            return { rides: cached.rides, fromCache: true };
          }
        }
      } catch {}
    }

    try {
      const response = await rideAPI.getMyRides({ page: 1, limit: PAGE_SIZE });
      if (response.data.success) {
        const allRides = response.data.data.rides || [];
        const serverPage = response.data.page;
        const serverPages = response.data.pages;

        // Update in-memory cache
        ridesCache.current = {
          allRides,
          timestamp: Date.now(),
          isValid: true,
        };
        setCachedRides(allRides);

        // Update pagination
        paginationMeta.current = { page: serverPage, pages: serverPages, hasMore: serverPage < serverPages };
        setHasMoreRides(serverPage < serverPages);

        // Persist to AsyncStorage
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          rides: allRides,
          page: serverPage,
          pages: serverPages,
          total: response.data.total,
          timestamp: Date.now(),
        })).catch(() => {});

        // Also update active rides from the same data
        const active = allRides.filter(ride =>
          ['accepted', 'driver_arrived', 'in_progress'].includes(ride.status)
        );
        setActiveRides(active);

        return { rides: allRides, fromCache: false };
      }
      return { rides: [], fromCache: false };
    } catch (error) {
      // Return cached data on error if available
      if (ridesCache.current.allRides.length > 0) {
        return { rides: ridesCache.current.allRides, fromCache: true };
      }
      throw error;
    }
  }, [isCacheValid]);

  // Load next page of rides (for infinite scroll)
  const loadMoreRides = useCallback(async () => {
    if (!paginationMeta.current.hasMore) return { rides: [], hasMore: false };

    const nextPage = paginationMeta.current.page + 1;
    try {
      const response = await rideAPI.getMyRides({ page: nextPage, limit: PAGE_SIZE });
      if (response.data.success) {
        const newRides = response.data.data.rides || [];
        const serverPage = response.data.page;
        const serverPages = response.data.pages;

        // Update pagination
        paginationMeta.current = { page: serverPage, pages: serverPages, hasMore: serverPage < serverPages };
        setHasMoreRides(serverPage < serverPages);

        // Merge with existing rides (deduplicate)
        const existingIds = new Set(ridesCache.current.allRides.map(r => r._id));
        const unique = newRides.filter(r => !existingIds.has(r._id));
        const merged = [...ridesCache.current.allRides, ...unique];

        ridesCache.current.allRides = merged;
        setCachedRides(merged);

        // Persist merged rides (up to 60)
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          rides: merged.slice(0, 60),
          page: serverPage,
          pages: serverPages,
          total: response.data.total,
          timestamp: Date.now(),
        })).catch(() => {});

        return { rides: newRides, hasMore: serverPage < serverPages };
      }
    } catch {}
    return { rides: [], hasMore: paginationMeta.current.hasMore };
  }, []);

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
      // Failed to load active rides
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
        setDriverOnlineStatus(true);

        return { success: true };
      }

      // If server update failed, stop tracking
      stopTracking();
      return { success: false, message: 'Failed to update status on server. Please try again.' };
    } catch (error) {
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
        setDriverOnlineStatus(false);

        return { success: true };
      }

      return { success: false, message: 'Failed to go offline' };
    } catch (error) {
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
    hasMoreRides,
    goOnline,
    goOffline,
    addActiveRide,
    removeActiveRide,
    updateActiveRide,
    refreshStats,
    updateStats,
    loadActiveRides,
    loadAllRides,
    loadMoreRides,
    invalidateCache,
    loadEarnings,
    invalidateEarningsCache,
  };

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
};
