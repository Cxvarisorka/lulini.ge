import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
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

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://api.gotours.ge';
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds as safety net

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
    if (isAuthenticated && user) {
      connectSocket();
    } else {
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, user]);

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
          if (isDriverOnline) {
            fetchPendingRides();
          }
        }
      }
    });

    return () => subscription.remove();
  }, [isDriverOnline]);

  // When driver online status is confirmed (e.g., from loadDriverStats sync),
  // ensure socket room membership and fetch any pending rides.
  // This fixes Android where the initial socket room join can be unreliable.
  useEffect(() => {
    isDriverOnlineRef.current = isDriverOnline;
    if (isDriverOnline && socketRef.current?.connected) {
      socketRef.current.emit('driver:rejoin');
      fetchPendingRides();
    }
  }, [isDriverOnline]);

  // Polling safety net: periodically check for rides while driver is online
  useEffect(() => {
    if (isDriverOnline) {
      // Start polling
      pollIntervalRef.current = setInterval(() => {
        fetchPendingRides();
      }, POLL_INTERVAL_MS);

      // Also fetch immediately when going online
      fetchPendingRides();
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
  }, [isDriverOnline]);

  const connectSocket = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        console.log('[Socket] No token found, skipping connection');
        return;
      }

      console.log(`[Socket] Token length: ${token.length}, starts with: ${token.substring(0, 10)}...`);
      console.log(`[Socket] Connecting to ${SOCKET_URL} (platform: ${Platform.OS})`);
      console.log(`[Socket] Transports: websocket, polling`);

      const socketInstance = io(SOCKET_URL, {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      socketInstance.on('connect', () => {
        console.log(`[Socket] Connected! ID: ${socketInstance.id}, transport: ${socketInstance.io.engine.transport.name}`);
        setIsConnected(true);

        // Always rejoin driver room on connect/reconnect to ensure room membership
        socketInstance.emit('driver:rejoin');

        // Fetch pending rides on any connect (not just reconnect)
        // On first connect, only fetch if driver is already known to be online
        if (wasConnectedRef.current || isDriverOnlineRef.current) {
          fetchPendingRides();
        }
        wasConnectedRef.current = true;
      });

      // Log transport upgrades (polling -> websocket)
      socketInstance.io.engine.on('upgrade', (transport) => {
        console.log(`[Socket] Transport upgraded to: ${transport.name}`);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log(`[Socket] Disconnected! Reason: ${reason}`);
        setIsConnected(false);

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

      // Listen for ride cancelled
      socketInstance.on('ride:cancelled', () => {
        setNewRideRequest(null);
        notifiedRideIdsRef.current.clear();
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
            data: { rideId: data.rideId, type: 'waiting_timeout' },
            sound: true,
          },
          trigger: null,
        });
      });

      socketRef.current = socketInstance;
      setSocket(socketInstance);
    } catch (error) {
      // Socket connection failed
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

  const fetchPendingRides = async () => {
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
      // Failed to fetch pending rides
    }
  };

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
          data: { rideId: rideData._id, type: 'ride_request' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          ...(Platform.OS === 'android' && {
            channelId: 'ride-requests',
          }),
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      // Failed to show notification
    }
  };

  const emitEvent = (event, data) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  };

  const clearRideRequest = () => {
    setNewRideRequest(null);
    notifiedRideIdsRef.current.clear();
  };

  // Called by DriverContext when driver goes online/offline
  const setDriverOnlineStatus = useCallback((online) => {
    setIsDriverOnline(online);
  }, []);

  const value = {
    socket,
    isConnected,
    newRideRequest,
    emitEvent,
    clearRideRequest,
    fetchPendingRides,
    setDriverOnlineStatus,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
