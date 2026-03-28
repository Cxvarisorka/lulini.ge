import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, AppState } from 'react-native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { rideAPI } from '../services/api';
import RideTrackingService from '../services/RideTrackingService';
// Import i18n instance directly (not the hook) because SocketContext is not a React component
import i18n from '../i18n';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://api.lulini.ge';
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

  // Only connect the socket when the user is an approved driver (role === 'driver').
  // During registration/onboarding the user has role === 'user' and the server's
  // isDriver middleware will reject the socket handshake, causing an infinite
  // connect → disconnect → reconnect loop.
  const isApprovedDriver = isAuthenticated && userId && user?.role === 'driver';

  useEffect(() => {
    if (isApprovedDriver) {
      // Skip reconnection if userId hasn't changed AND socket is still alive.
      // [C3 FIX] Check socket.connected — a dead/failed socket must be replaced.
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
  }, [isApprovedDriver, userId]);

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
        query: { appType: 'driver' },
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

        // Do NOT auto-reconnect on server-initiated disconnect.
        // "io server disconnect" means the server explicitly kicked us
        // (e.g. auth failure, not authorized as driver). Reconnecting
        // immediately creates an infinite connect→disconnect loop.
        // The built-in reconnection (reconnection: true) handles
        // transport-level disconnects (ping timeout, transport close)
        // automatically — we only need manual reconnect for those cases
        // where socket.io's auto-reconnect doesn't fire.
        if (reason === 'io server disconnect') {
          if (__DEV__) console.log('[Socket] Server kicked us — NOT reconnecting');
          // Clean up so the React effect can create a fresh socket if conditions change
          socketRef.current = null;
          setSocket(null);
          return;
        }
      });

      socketInstance.on('connect_error', (error) => {
        if (__DEV__) console.log(`[Socket] Connection error: ${error.message}`);
        setIsConnected(false);
      });

      // Server emits 'error' before disconnecting unauthorized clients
      socketInstance.on('error', (err) => {
        if (__DEV__) console.log(`[Socket] Server error: ${err?.message || err}`);
        // Disable auto-reconnect when server explicitly rejects us
        socketInstance.io.opts.reconnection = false;
      });

      // Listen for new ride requests
      // C9: Notification scheduled outside state updater (state updaters must be pure)
      socketInstance.on('ride:request', (rideData) => {
        setNewRideRequest((current) => {
          if (current && current._id === rideData._id) return current;
          return rideData;
        });
        // Show notification separately — idempotent via notifiedRideIds check inside
        showRideNotification(rideData);
      });

      // Listen for ride updates
      socketInstance.on('ride:updated', () => {
        // Ride updated event received
      });

      // Listen for ride cancelled (by passenger or admin)
      // C9: Notification scheduled outside state updater
      socketInstance.on('ride:cancelled', (ride) => {
        const rideId = ride?._id || ride?.rideId;
        if (rideId) {
          notifiedRideIdsRef.current.delete(rideId);
        } else {
          notifiedRideIdsRef.current.clear();
        }
        // Read current state before the updater to decide notification outside
        setNewRideRequest((current) => {
          if (!current || !rideId || current._id === rideId) {
            return null;
          }
          return current;
        });
        // Show cancellation notification outside state updater
        Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('notifications.push.rideCancelledTitle'),
            body: i18n.t('notifications.push.rideCancelledBody'),
            data: { rideId: rideId, type: 'ride_cancelled', _local: true },
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
      });

      // Listen for ride unavailable (accepted by another driver or cancelled by user)
      // C9: Notification scheduled outside state updater
      socketInstance.on('ride:unavailable', (data) => {
        notifiedRideIdsRef.current.delete(data.rideId);
        setNewRideRequest((current) => {
          if (current && current._id === data.rideId) {
            return null;
          }
          return current;
        });
        // Show unavailable notification outside state updater
        Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('notifications.push.rideUnavailableTitle'),
            body: i18n.t('notifications.push.rideUnavailableBody'),
            data: { rideId: data.rideId, type: 'ride_unavailable', _local: true },
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
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
        Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('notifications.push.waitingTimeoutTitle'),
            body: i18n.t('notifications.push.waitingTimeoutBody'),
            data: { rideId: data.rideId, type: 'waiting_timeout', _local: true },
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
      });

      socketRef.current = socketInstance;
      setSocket(socketInstance);

      // Wire RideTrackingService socket emitter — allows ride tracking to
      // send volatile location events through the existing socket connection
      RideTrackingService.getInstance().setSocketEmitter((event, data) => {
        if (socketInstance.connected) {
          socketInstance.volatile.emit(event, data);
        }
      });
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
      // Clear ride tracking socket emitter
      RideTrackingService.getInstance().setSocketEmitter(null);
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
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('notifications.push.rideRequestTitle'),
          body: i18n.t('notifications.push.rideRequestBody', {
            address: rideData.pickup?.address || i18n.t('common.unknown'),
          }),
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
