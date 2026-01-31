import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://192.168.100.3:3000';

export const SocketProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newRideRequest, setNewRideRequest] = useState(null);
  const socketRef = useRef(null);

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

  const connectSocket = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;

      const socketInstance = io(SOCKET_URL, {
        auth: {
          token,
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketInstance.on('connect', () => {
        console.log('Socket connected:', socketInstance.id);
        setIsConnected(true);

        // Join driver room
        if (user?.id) {
          socketInstance.emit('driver:join', user.id);
        }

        // Don't fetch pending rides on connection
        // Only fetch when driver explicitly goes online
      });

      socketInstance.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      socketInstance.on('connect_error', (error) => {
        console.log('Socket connection error:', error.message);
        setIsConnected(false);
      });

      // Listen for new ride requests
      socketInstance.on('ride:request', (rideData) => {
        console.log('New ride request:', rideData);
        setNewRideRequest(rideData);

        // Show push notification
        showRideNotification(rideData);
      });

      // Listen for ride updates
      socketInstance.on('ride:updated', (rideData) => {
        console.log('Ride updated:', rideData);
      });

      // Listen for ride cancelled
      socketInstance.on('ride:cancelled', (rideData) => {
        console.log('Ride cancelled:', rideData);
        setNewRideRequest(null);
      });

      // Listen for ride unavailable (accepted by another driver or cancelled by user)
      socketInstance.on('ride:unavailable', (data) => {
        console.log('Ride no longer available:', data);
        // Clear the ride request if it matches
        setNewRideRequest((current) => {
          if (current && current._id === data.rideId) {
            console.log('Clearing ride request as it is no longer available');
            return null;
          }
          return current;
        });
      });

      // Listen for ride expired (ride request timed out)
      socketInstance.on('ride:expired', (data) => {
        console.log('Ride expired:', data);
        // Clear the ride request if it matches
        setNewRideRequest((current) => {
          if (current && current._id === data.rideId) {
            console.log('Clearing ride request as it has expired');
            return null;
          }
          return current;
        });
      });

      // Listen for waiting timeout (passenger didn't show up)
      socketInstance.on('ride:waitingTimeout', (data) => {
        console.log('Ride waiting timeout:', data);
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
      console.log('Error connecting socket:', error);
    }
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  };

  const fetchPendingRides = async () => {
    try {
      console.log('Fetching pending rides...');
      const response = await rideAPI.getAvailableRides();
      console.log('Pending rides response:', response.data);

      if (response.data.success && response.data.data.rides.length > 0) {
        // Show the most recent pending ride
        const mostRecentRide = response.data.data.rides[0];
        console.log('Found pending ride:', mostRecentRide);
        setNewRideRequest(mostRecentRide);
        showRideNotification(mostRecentRide);
      } else {
        console.log('No pending rides found');
      }
    } catch (error) {
      console.log('Error fetching pending rides:', error);
      console.error('Full error details:', error.response?.data || error.message);
    }
  };

  const showRideNotification = async (rideData) => {
    try {
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
      console.log('Error showing notification:', error);
    }
  };

  const emitEvent = (event, data) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  };

  const clearRideRequest = () => {
    setNewRideRequest(null);
  };

  const value = {
    socket,
    isConnected,
    newRideRequest,
    emitEvent,
    clearRideRequest,
    fetchPendingRides,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
