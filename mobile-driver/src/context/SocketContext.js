import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, AppState } from 'react-native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { rideAPI } from '../services/api';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || '';
// Poll less aggressively when socket is healthy, more when degraded
const POLL_INTERVAL_HEALTHY_MS = 60000; // 60s when WebSocket is connected
const POLL_INTERVAL_DEGRADED_MS = 10000; // 10s when socket is disconnected
// Debounce fetchPendingRides to prevent burst calls (reconnect + appState + online status)
const FETCH_DEBOUNCE_MS = 3000;

export const SocketProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newRideRequest, setNewRideRequest] = useState(null);
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const socketRef = useRef(null);
  const wasConnectedRef = useRef(false);
  const pollIntervalRef = useRef(null);
  const isDriverOnlineRef = useRef(false);
  // Track notified ride IDs to prevent duplicate notifications
  const notifiedRideIdsRef = useRef(new Set());
  // Debounce timer for fetchPendingRides to prevent burst calls
  const fetchDebounceRef = useRef(null);

  // Stable user ID ref — prevents socket churn when user object reference
  // changes (e.g., refreshUser() returns a new object with same _id).
  const userIdRef = useRef(null);
  const userId = user?._id || user?.id;

  // Set up notification channel for Android
  useEffect(() => {
    const setupNotificationChannel = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('ride-requests', {
          name: 'Ride Requests',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      }
    };

    setupNotificationChannel();
  }, []);

  useEffect(() => {
    if (isAuthenticated && userId) {
      // Skip reconnection if userId hasn't actually changed
      if (userIdRef.current === userId && socketRef.current?.connected) {
        return;
      }
      userIdRef.current = userId;
      connectSocket();
    } else {
      disconnectSocket();
      userIdRef.current = null;
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, userId]);

  // Reconnect socket when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && socketRef.current) {
        // App came to foreground - check socket health
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        } else {
          // Socket thinks it's connected - rejoin room and fetch any missed rides
          socketRef.current.emit('driver:rejoin');
          if (isDriverOnlineRef.current) {
            debouncedFetchPendingRides();
          }
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // Ref-based fetch so the debounce callback never goes stale
  const fetchPendingRidesRef = useRef(null);
  fetchPendingRidesRef.current = fetchPendingRides;

  // Debounced version of fetchPendingRides — prevents burst calls on reconnect
  const debouncedFetchPendingRides = useCallback(() => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      fetchPendingRidesRef.current();
    }, FETCH_DEBOUNCE_MS);
  }, []);

  // When driver online status is confirmed (e.g., from loadDriverStats sync),
  // ensure socket room membership and fetch any pending rides.
  // [C1 FIX] Use socketRef.current instead of undefined socketInstance
  useEffect(() => {
    isDriverOnlineRef.current = isDriverOnline;
    if (isDriverOnline && socketRef.current?.connected) {
      socketRef.current.emit('driver:rejoin');
      debouncedFetchPendingRides();
    }
  }, [isDriverOnline, debouncedFetchPendingRides]);

  // Adaptive polling: fast when socket is down, slow when healthy
  useEffect(() => {
    if (isDriverOnline) {
      const interval = isConnected ? POLL_INTERVAL_HEALTHY_MS : POLL_INTERVAL_DEGRADED_MS;

      // Clear existing interval when socket health changes
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = setInterval(() => {
        fetchPendingRidesRef.current();
      }, interval);

      // Also fetch immediately when going online
      debouncedFetchPendingRides();
    } else {
      // Stop polling when offline
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isDriverOnline, isConnected]);

  const connectSocket = async () => {
    try {
      // Disconnect any existing socket before creating a new one
      // (prevents orphaned sockets during async gap)
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        console.log('[Socket] No token found, skipping connection');
        return;
      }

      if (__DEV__) {
        console.log(`[Socket] Connecting to ${SOCKET_URL}`);
      }

      // [C2 FIX] Don't fall back to stale closure token
      const socketInstance = io(SOCKET_URL, {
        auth: async (cb) => {
          // Use a function so reconnections always get a fresh token
          const freshToken = await SecureStore.getItemAsync('token');
          if (!freshToken) {
            console.warn('[Socket] No fresh token available for auth, disconnecting');
            socketRef.current?.disconnect();
            return;
          }
          cb({ token: freshToken });
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      // Track rejoin timer so we can clean up on disconnect
      let rejoinTimer = null;

      socketInstance.on('connect', () => {
        if (__DEV__) console.log(`[Socket] Connected! ID: ${socketInstance.id}`);
        setIsConnected(true);

        // Clear any stale rejoin timer from a previous connection
        if (rejoinTimer) {
          clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }

        // Rejoin driver room — server sends 'driver:rejoined' ACK
        socketInstance.emit('driver:rejoin');
        rejoinTimer = setTimeout(() => {
          if (__DEV__) console.warn('[Socket] driver:rejoin ACK timeout (no reconnect — will retry on next event)');
        }, 5000);

        // Remove any stale listeners before adding a new one
        socketInstance.off('driver:rejoined');
        socketInstance.once('driver:rejoined', () => {
          if (__DEV__) console.log('[Socket] driver:rejoin ACK received');
          if (rejoinTimer) {
            clearTimeout(rejoinTimer);
            rejoinTimer = null;
          }
        });

        // Fetch pending rides on any connect (not just reconnect)
        // On first connect, only fetch if driver is already known to be online
        if (wasConnectedRef.current || isDriverOnlineRef.current) {
          debouncedFetchPendingRides();
        }
        wasConnectedRef.current = true;
      });

      socketInstance.on('disconnect', (reason) => {
        if (__DEV__) console.log(`[Socket] Disconnected: ${reason}`);
        setIsConnected(false);

        // Clean up pending rejoin timer
        if (rejoinTimer) {
          clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }

        // If server disconnected us, force reconnect
        if (reason === 'io server disconnect') {
          socketInstance.connect();
        }
      });

      socketInstance.on('connect_error', (error) => {
        console.log(`[Socket] Connection error: ${error.message}`);
        setIsConnected(false);
      });

      // Listen for new ride requests
      socketInstance.on('ride:request', (rideData) => {

        

        setNewRideRequest((current) => {
          // Avoid showing duplicate if we already have this ride (from polling)
          if (current && current._id === rideData._id) return current;
          showRideNotification(rideData);
          return rideData;
        });
      });

      // Listen for ride updates
      socketInstance.on('ride:updated', () => {
        // Ride updated event received
      });

      // Listen for ride cancelled (by passenger or admin)
      socketInstance.on('ride:cancelled', (ride) => {
        const rideId = ride?._id || ride?.rideId;
        if (rideId) {
          notifiedRideIdsRef.current.delete(rideId);
        } else {
          notifiedRideIdsRef.current.clear();
        }
        // Clear ride request modal if it matches (or if no ID to compare)
        setNewRideRequest((current) => {
          if (!current || !rideId || current._id === rideId) return null;
          return current;
        });
      });

      // Listen for ride unavailable (accepted by another driver or cancelled by user)
      socketInstance.on('ride:unavailable', (data) => {
        notifiedRideIdsRef.current.delete(data.rideId);
        // Clear the ride request if it matches
        setNewRideRequest((current) => {
          if (current && current._id === data.rideId) {
            return null;
          }
          return current;
        });
      });

      // Listen for ride expired (ride request timed out)
      socketInstance.on('ride:expired', (data) => {
        notifiedRideIdsRef.current.delete(data.rideId);
        // Clear the ride request if it matches
        setNewRideRequest((current) => {
          if (current && current._id === data.rideId) {
            return null;
          }
          return current;
        });
      });

      // Listen for waiting timeout (passenger didn't show up)
      socketInstance.on('ride:waitingTimeout', (data) => {
        // TODO: i18n - these notification strings need localization
        // Show notification that ride was cancelled due to passenger no-show
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Ride Cancelled',
            body: data.message || 'Passenger did not show up within 3 minutes',
            data: { rideId: data.rideId, type: 'waiting_timeout', _local: true },
            sound: true,
          },
          trigger: null,
        });
      });

      socketRef.current = socketInstance;
      setSocket(socketInstance);
    } catch (error) {
      console.error('[Socket] Connection setup failed:', error.message);
    }
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      wasConnectedRef.current = false;
    }
  };

  // [C5 FIX] Use ref for fetchPendingRides so context value stays stable
  async function fetchPendingRides() {
    try {
      const response = await rideAPI.getAvailableRides();

      if (response.data.success && response.data.data.rides.length > 0) {
        const mostRecentRide = response.data.data.rides[0];
        // Only set if no ride is currently shown (don't overwrite active request)
        setNewRideRequest((current) => {
          if (current) return current;
          showRideNotification(mostRecentRide);
          return mostRecentRide;
        });
      }
    } catch (error) {
      console.warn('[Socket] Failed to fetch pending rides:', error.message);
    }
  }

  const showRideNotification = async (rideData) => {
    // Skip if we already notified for this ride
    if (notifiedRideIdsRef.current.has(rideData._id)) return;
    notifiedRideIdsRef.current.add(rideData._id);

    try {
      // TODO: i18n - these notification strings need localization
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'New Ride Request!',
          body: `Pickup: ${rideData.pickup?.address || 'Unknown location'}`,
          data: { rideId: rideData._id, type: 'ride_request', _local: true },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          ...(Platform.OS === 'android' && {
            channelId: 'ride-requests',
          }),
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('[Socket] Failed to show notification:', error.message);
    }
  };

  const emitEvent = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const clearRideRequest = useCallback(() => {
    setNewRideRequest(null);
    notifiedRideIdsRef.current.clear();
  }, []);

  // Called by DriverContext when driver goes online/offline
  const setDriverOnlineStatus = useCallback((online) => {
    setIsDriverOnline(online);
  }, []);

  // [C5 FIX] Stable ref-based wrapper for fetchPendingRides to avoid context churn
  const stableFetchPendingRides = useCallback(() => {
    fetchPendingRidesRef.current();
  }, []);

  // [C5 FIX] Only depend on values that actually change for consumers
  const value = useMemo(() => ({
    socket,
    isConnected,
    newRideRequest,
    emitEvent,
    clearRideRequest,
    fetchPendingRides: stableFetchPendingRides,
    setDriverOnlineStatus,
  }), [socket, isConnected, newRideRequest, emitEvent, clearRideRequest, stableFetchPendingRides, setDriverOnlineStatus]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
