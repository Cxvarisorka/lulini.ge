import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';

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

  const showRideNotification = async (rideData) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'New Ride Request!',
          body: `Pickup: ${rideData.pickup?.address || 'Unknown location'}`,
          data: { rideId: rideData._id, type: 'ride_request' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
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
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
