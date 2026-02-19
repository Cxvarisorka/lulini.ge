import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';

const SocketContext = createContext();

// Socket URL Configuration
const API_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://api.gotours.ge';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { onReconnect } = useNetwork();

  // Stable user ID ref — prevents socket churn when user object reference
  // changes (e.g., refreshUser() returns a new object with same _id).
  const userIdRef = useRef(null);
  const userId = user?._id || user?.id;

  useEffect(() => {
    let socketInstance = null;

    const connectSocket = async () => {
      if (!isAuthenticated || !userId) {
        if (socketInstance) {
          socketInstance.disconnect();
          setSocket(null);
          setConnected(false);
        }
        userIdRef.current = null;
        return;
      }

      // Skip reconnection if userId hasn't actually changed
      if (userIdRef.current === userId && socket?.connected) {
        return;
      }
      userIdRef.current = userId;

      try {
        const token = await SecureStore.getItemAsync('token');

        if (!token) {
          return;
        }

        socketInstance = io(API_URL, {
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
        });

        socketInstance.on('connect', () => {
          setConnected(true);
        });

        socketInstance.on('disconnect', () => {
          setConnected(false);
        });

        socketInstance.on('connect_error', (error) => {
          console.warn('[Socket] Connection error:', error.message);
        });

        setSocket(socketInstance);
      } catch (error) {
        console.error('[Socket] Failed to set up socket:', error.message);
      }
    };

    connectSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [isAuthenticated, userId]);

  // When network connectivity is restored, nudge socket.io reconnection
  // and emit fresh passenger location so the server/driver has current coords
  useEffect(() => {
    const unsubscribe = onReconnect(async () => {
      // Nudge socket reconnection if it hasn't auto-recovered yet
      if (socket && !socket.connected) {
        socket.connect();
      }

      // Emit fresh passenger location on reconnect
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (socket?.connected) {
            socket.emit('user:locationUpdate', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          }
        }
      } catch (e) {
        console.warn('[Socket] Failed to emit location on reconnect:', e.message);
      }
    });

    return unsubscribe;
  }, [socket, onReconnect]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};
