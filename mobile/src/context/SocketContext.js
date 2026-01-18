import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

// Socket URL Configuration
const API_URL = 'http://192.168.100.3:3000';

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
          console.log('No token found, cannot connect socket');
          return;
        }

        socketInstance = io(API_URL, {
          transports: ['websocket'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
          console.log('Socket connected:', socketInstance.id);
          setConnected(true);
        });

        socketInstance.on('disconnect', () => {
          console.log('Socket disconnected');
          setConnected(false);
        });

        socketInstance.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message);
        });

        setSocket(socketInstance);
      } catch (error) {
        console.error('Error setting up socket:', error);
      }
    };

    connectSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [isAuthenticated, user]);

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
