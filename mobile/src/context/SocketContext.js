import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';

const SocketContext = createContext();

// Socket URL Configuration
const API_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://api.lulini.ge';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { onReconnect } = useNetwork();

  const userId = user?._id || user?.id;

  // Keep a ref to the current socket so we can disconnect it reliably,
  // even when the async connect hasn't finished before cleanup runs.
  const socketRef = useRef(null);

  // N6: Circuit breaker — stop reconnecting after repeated auth/connection failures
  const consecutiveErrorsRef = useRef(0);
  const CIRCUIT_BREAKER_THRESHOLD = 5;

  useEffect(() => {
    // Guard: prevent stale async completions from mutating state after cleanup
    let cancelled = false;

    const connectSocket = async () => {
      if (!isAuthenticated || !userId) {
        // Disconnect any existing socket
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (!cancelled) {
          setSocket(null);
          setConnected(false);
        }
        return;
      }

      // If the same user already has a live socket, skip
      if (socketRef.current?.connected && socketRef.current._userId === userId) {
        return;
      }

      // Disconnect previous socket before creating a new one
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      try {
        const token = await SecureStore.getItemAsync('token');
        // Bail out if effect was cleaned up while we were awaiting
        if (cancelled || !token) return;

        const socketInstance = io(API_URL, {
          query: { appType: 'passenger' },
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
        });

        // Tag with userId so we can detect stale sockets later
        socketInstance._userId = userId;

        socketInstance.on('connect', () => {
          consecutiveErrorsRef.current = 0; // N6: Reset circuit breaker on successful connect
          if (!cancelled) setConnected(true);
        });

        socketInstance.on('disconnect', (reason) => {
          if (__DEV__) console.warn('[Socket] Disconnected, reason:', reason);
          if (!cancelled) setConnected(false);
        });

        socketInstance.on('connect_error', (error) => {
          if (__DEV__) console.warn('[Socket] Connection error:', error.message);
          // N6: Circuit breaker — stop reconnecting after repeated failures
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= CIRCUIT_BREAKER_THRESHOLD) {
            if (__DEV__) console.warn(`[Socket] Circuit breaker open after ${CIRCUIT_BREAKER_THRESHOLD} failures — stopping reconnection`);
            socketInstance.disconnect();
          }
        });

        // If cleanup ran while we were awaiting, kill this socket immediately
        if (cancelled) {
          socketInstance.disconnect();
          return;
        }

        socketRef.current = socketInstance;
        setSocket(socketInstance);
      } catch (error) {
        if (__DEV__) console.error('[Socket] Failed to set up socket:', error.message);
      }
    };

    connectSocket();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, userId]);

  // When network connectivity is restored, nudge socket.io reconnection
  // and emit fresh passenger location so the server/driver has current coords
  useEffect(() => {
    const unsubscribe = onReconnect(async () => {
      const s = socketRef.current;
      // N6: Reset circuit breaker on network reconnect — give it fresh chances
      consecutiveErrorsRef.current = 0;
      // Nudge socket reconnection if it hasn't auto-recovered yet
      if (s && !s.connected) {
        s.connect();
      }

      // Emit fresh passenger location on reconnect
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 10000)),
          ]);
          if (socketRef.current?.connected) {
            socketRef.current.emit('user:locationUpdate', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[Socket] Failed to emit location on reconnect:', e.message);
      }
    });

    return unsubscribe;
  }, [onReconnect]);

  // Memoize context value — consumers only re-render when socket or connected
  // actually change, not on every SocketProvider render.
  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return (
    <SocketContext.Provider value={value}>
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
