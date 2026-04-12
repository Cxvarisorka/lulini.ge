import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { authEvents } from '../services/authEvents';
import { registerForPushNotifications, unregisterPushToken } from '../services/pushNotifications';
import { clearRetryQueue } from '../services/backgroundLocation';
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

  // Listen for force-logout events from 401 interceptor
  useEffect(() => {
    const unsubscribe = authEvents.on('force-logout', () => {
      logout();
    });
    return unsubscribe;
  }, []);

  const checkAuthStatus = async () => {
    try {
      const storedUser = await SecureStore.getItemAsync('user');
      const token = await SecureStore.getItemAsync('token');

      if (storedUser && token) {
        // [M4 FIX] Check JWT expiry before trusting stored token.
        // JWT format: header.payload.signature — payload is base64url JSON with exp field.
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
              // Token expired — force re-login
              await SecureStore.deleteItemAsync('token');
              await SecureStore.deleteItemAsync('user');
              return; // falls through to finally { setLoading(false) }
            }
          }
        } catch (_) {
          // Malformed token — clear and re-login
          await SecureStore.deleteItemAsync('token');
          await SecureStore.deleteItemAsync('user');
          return;
        }

        const userData = JSON.parse(storedUser);
        // Allow both 'driver' (approved) and 'user' (in onboarding) roles.
        // The navigator handles routing to onboarding vs main app.
        if (userData.role === 'driver' || userData.role === 'user') {
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          // Admin accounts should not use the driver app
          await logout();
        }
      }
    } catch (error) {
      // Failed to check auth status
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });

      if (response.data.success) {
        const userData = response.data.data.user;
        const token = response.data.token;

        // Allow both 'driver' role (approved drivers) and 'user' role
        // (new registrations going through onboarding). The navigator will
        // route 'user' role to the OnboardingScreen automatically.
        // Only reject admin accounts trying to use the driver app.
        if (userData.role === 'admin') {
          throw new Error('Not authorized as driver');
        }

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
  }, []);

  // Accept an already-obtained token + user data (e.g. from /auth/register)
  // so the caller doesn't need a separate login round-trip.
  const loginWithToken = useCallback(async (token, userData) => {
    try {
      if (userData.role === 'admin') {
        throw new Error('Not authorized as driver');
      }

      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('user', JSON.stringify(userData));

      setUser(userData);
      setIsAuthenticated(true);

      return { success: true, user: userData };
    } catch (error) {
      const message = error.message === 'Not authorized as driver'
        ? error.message
        : 'Failed to save session';
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
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
      await AsyncStorage.removeItem('@driver_rides_cache').catch(() => {});
      await AsyncStorage.removeItem('@driver_onboarding_cache').catch(() => {});
      // [M10 FIX] Clear location retry queue to prevent sending stale data on next login
      await clearRetryQueue().catch(() => {});
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const updateUser = useCallback(async (updatedData) => {
    try {
      setUser((prev) => {
        const updated = { ...prev, ...updatedData };
        SecureStore.setItemAsync('user', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    } catch (error) {
      // Failed to update user data
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated,
    login,
    loginWithToken,
    logout,
    updateUser,
  }), [user, loading, isAuthenticated, login, loginWithToken, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
