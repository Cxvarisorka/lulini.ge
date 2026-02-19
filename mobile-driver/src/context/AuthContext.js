import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';
import { registerForPushNotifications, unregisterPushToken } from '../services/pushNotifications';
import i18n from '../i18n';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Register push token when user authenticates
  useEffect(() => {
    if (user && isAuthenticated) {
      registerForPushNotifications(i18n.language).catch(() => {});
    }
  }, [user, isAuthenticated]);

  const checkAuthStatus = async () => {
    try {
      const storedUser = await SecureStore.getItemAsync('user');
      const token = await SecureStore.getItemAsync('token');

      if (storedUser && token) {
        const userData = JSON.parse(storedUser);
        // Verify user is a driver
        if (userData.role === 'driver') {
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          // Not a driver, clear storage
          await logout();
        }
      }
    } catch (error) {
      // Failed to check auth status
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });

      if (response.data.success) {
        const userData = response.data.data.user;
        const token = response.data.token; // Token is at root level of response

        // Verify user is a driver
        if (userData.role !== 'driver') {
          throw new Error('Not authorized as driver');
        }

        // Store token and user data
        await SecureStore.setItemAsync('token', token);
        await SecureStore.setItemAsync('user', JSON.stringify(userData));

        setUser(userData);
        setIsAuthenticated(true);

        return { success: true, user: userData };
      }

      return { success: false, message: response.data.message };
    } catch (error) {
      const message = error.message === 'Not authorized as driver'
        ? error.message
        : error.response?.data?.message || 'Invalid credentials';
      return { success: false, message };
    }
  };

  const logout = async () => {
    try {
      await unregisterPushToken();
    } catch (error) {
      // Push unregister error
    }
    try {
      await authAPI.logout();
    } catch (error) {
      // Logout API call failed, proceeding with local cleanup
    } finally {
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateUser = async (updatedData) => {
    try {
      const updatedUser = { ...user, ...updatedData };
      await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      // Failed to update user data
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
