import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

// Socket URL Configuration
const API_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://api.gotours.ge';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    let socketInstance = null;

    const connectSocket = async () => {
      if (!isAuthenticated || !user) {
        if (socketInstance) {
          socketInstance.disconnect();
          setSocket(null);
          setConnected(false);
        }
        return;
      }

      try {
        const token = await SecureStore.getItemAsync('token');

        if (!token) {
          return;
        }

        socketInstance = io(API_URL, {
          transports: ['websocket'],
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

        socketInstance.on('connect_error', () => {
        });

        setSocket(socketInstance);
      } catch (error) {
        // Failed to set up socket
      }
    };

    connectSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [isAuthenticated, user?._id]);

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
