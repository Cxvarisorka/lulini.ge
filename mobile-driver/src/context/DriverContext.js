import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
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
  const { startTracking, stopTracking, isTracking, permissionsReady } = useLocation();
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

  // [H1 FIX] Single source of truth for rides — state-based only
  const [cachedRides, setCachedRides] = useState([]);
  const ridesCacheTimestamp = useRef(null);
  const ridesCacheValid = useRef(false);

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
    ridesCacheValid.current = false;
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
    if (!ridesCacheValid.current || !ridesCacheTimestamp.current) return false;
    return Date.now() - ridesCacheTimestamp.current < CACHE_EXPIRATION_MS;
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

  // [H2 FIX] Use refs for callbacks to keep socket listener registration stable
  const invalidateCacheRef = useRef(invalidateCache);
  invalidateCacheRef.current = invalidateCache;
  const invalidateEarningsCacheRef = useRef(invalidateEarningsCache);
  invalidateEarningsCacheRef.current = invalidateEarningsCache;

  // Listen for real-time updates from socket — only re-register when socket changes
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
      if (data.rideId) {
        removeActiveRide(data.rideId);
      }
      invalidateCacheRef.current();
      invalidateEarningsCacheRef.current();
    };

    // Handle ride review event - update rating
    const handleRideReviewed = (data) => {
      if (data.updatedStats) {
        updateStats({
          rating: data.updatedStats.rating,
        });
      }
    };

    const handleNewRide = () => {
      invalidateCacheRef.current();
    };

    const handleRideCancelled = (ride) => {
      const rideId = ride?._id || ride?.rideId;
      if (rideId) {
        removeActiveRide(rideId);
      }
      invalidateCacheRef.current();
    };

    const handleRideUpdated = () => {
      invalidateCacheRef.current();
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
  }, [socket]); // [H2 FIX] Only depend on socket, use refs for callbacks

  // Track whether we need to start tracking after permissions are ready
  const pendingTrackingRef = useRef(false);

  // When permissionsReady becomes true, start tracking if it was deferred
  useEffect(() => {
    if (permissionsReady && pendingTrackingRef.current && !isTracking) {
      pendingTrackingRef.current = false;
      startTracking();
    }
  }, [permissionsReady]);

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
          if (permissionsReady) {
            startTracking();
          } else {
            pendingTrackingRef.current = true;
          }
        }
      }
    } catch (error) {
      // Failed to load driver stats
    }
  };

  // [H1 FIX] Use cachedRidesRef to read current rides inside callbacks without stale closure
  const cachedRidesRef = useRef([]);
  cachedRidesRef.current = cachedRides;

  // Load rides page 1 with caching support
  const loadAllRides = useCallback(async (forceRefresh = false) => {
    // Return in-memory cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
      return { rides: cachedRidesRef.current, fromCache: true };
    }

    // Try AsyncStorage cache on first load (not force refresh)
    if (!forceRefresh && !ridesCacheValid.current) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached.rides?.length && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
            ridesCacheTimestamp.current = cached.timestamp;
            ridesCacheValid.current = true;
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

        // Update cache
        ridesCacheTimestamp.current = Date.now();
        ridesCacheValid.current = true;
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
      if (cachedRidesRef.current.length > 0) {
        return { rides: cachedRidesRef.current, fromCache: true };
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
        setCachedRides(prev => {
          const existingIds = new Set(prev.map(r => r._id));
          const unique = newRides.filter(r => !existingIds.has(r._id));
          const merged = [...prev, ...unique];

          // Persist merged rides (up to 60)
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
            rides: merged.slice(0, 60),
            page: serverPage,
            pages: serverPages,
            total: response.data.total,
            timestamp: Date.now(),
          })).catch(() => {});

          return merged;
        });

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

  const addActiveRide = useCallback((ride) => {
    setActiveRides((prev) => [...prev, ride]);
  }, []);

  const removeActiveRide = useCallback((rideId) => {
    setActiveRides((prev) => prev.filter((ride) => ride._id !== rideId));
  }, []);

  const updateActiveRide = useCallback((rideId, updates) => {
    setActiveRides((prev) =>
      prev.map((ride) => (ride._id === rideId ? { ...ride, ...updates } : ride))
    );
  }, []);

  const refreshStats = useCallback(async () => {
    await loadDriverStats();
  }, []);

  const updateStats = useCallback((newStats) => {
    setStats((prev) => ({ ...prev, ...newStats }));
  }, []);

  const value = useMemo(() => ({
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
  }), [isOnline, activeRides, cachedRides, stats, loading, hasMoreRides,
    addActiveRide, removeActiveRide, updateActiveRide, refreshStats, updateStats,
    loadActiveRides, loadAllRides, loadMoreRides, invalidateCache, loadEarnings, invalidateEarningsCache]);

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
};
