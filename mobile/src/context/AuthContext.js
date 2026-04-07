import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, setOnUnauthorized } from '../services/api';
import { setUserInfo as setCrispUser, resetCrispSession } from '../services/crisp';
import { registerForPushNotifications, unregisterPushToken } from '../services/pushNotifications';
import { clearAllCaches } from '../services/googleMaps';
import i18n from '../i18n';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState(null);

  // Check for existing token on app load (M3: cancellation flag)
  useEffect(() => {
    let isCancelled = false;

    const checkAuthStatus = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          // [M4 FIX] Check JWT expiry before making a network call.
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.exp && payload.exp * 1000 < Date.now()) {
                await SecureStore.deleteItemAsync('token');
                return;
              }
            }
          } catch (_) {
            await SecureStore.deleteItemAsync('token');
            return;
          }

          const response = await authAPI.getMe();
          if (response.data.success && !isCancelled) {
            setUser(response.data.data.user);
          }
        }
      } catch (err) {
        if (err.response?.status === 401) {
          await SecureStore.deleteItemAsync('token');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    checkAuthStatus();
    return () => { isCancelled = true; };
  }, []);

  // Register push token and sync Crisp user info when user authenticates
  useEffect(() => {
    if (user) {
      registerForPushNotifications(i18n.language).catch(() => {});
      setCrispUser({
        id: user._id || user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.email,
        phone: user.phone,
      });
    }
  }, [user]);

  // Phone OTP - Send OTP
  const sendPhoneOtp = useCallback(async (phone) => {
    try {
      setError(null);

      const response = await authAPI.sendPhoneOtp(phone);

      if (response.data.success) {
        setPendingPhoneVerification(phone);
        return { success: true, isRegistered: response.data.isRegistered };
      }
      return { success: false, error: 'Failed to send OTP' };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send OTP';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  // Phone OTP - Verify OTP
  const verifyPhoneOtp = useCallback(async (phone, code, firstName = null, lastName = null, verificationToken = null) => {
    try {
      setError(null);

      const response = await authAPI.verifyPhoneOtp(phone, code, firstName, lastName, verificationToken);

      if (response.data.success) {
        if (response.data.requiresRegistration) {
          return {
            success: true,
            requiresRegistration: true,
            verificationToken: response.data.verificationToken,
            phone
          };
        }

        const token = response.data.token;
        if (token) {
          await SecureStore.setItemAsync('token', token);
        }
        setUser(response.data.data.user);
        setIsNewUser(response.data.isNewUser || false);
        setPendingPhoneVerification(null);
        return { success: true, isNewUser: response.data.isNewUser };
      }
      return { success: false, error: 'Verification failed' };
    } catch (err) {
      const message = err.response?.data?.message || 'Verification failed';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  // Complete onboarding (L1: use functional update to avoid stale closure)
  const completeOnboarding = useCallback(async () => {
    try {
      await authAPI.completeOnboarding();
      setIsNewUser(false);
      setUser(prev => prev ? { ...prev, hasCompletedOnboarding: true } : prev);
    } catch (err) {
      // Complete onboarding failed
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await unregisterPushToken();
    } catch (err) {
      // Push unregister error
    }
    try {
      await authAPI.logout();
    } catch (err) {
      // Logout API error
    } finally {
      await SecureStore.deleteItemAsync('token');
      await AsyncStorage.removeItem('@rides_cache').catch(() => {});
      clearAllCaches();
      resetCrispSession();
      setUser(null);
    }
  }, []);

  // H1: Register 401 logout handler so stale tokens force UI logout
  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authAPI.getMe();
      if (response.data.success) {
        setUser(response.data.data.user);
      }
    } catch (err) {
      // Refresh user failed
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isNewUser,
    pendingPhoneVerification,
    sendPhoneOtp,
    verifyPhoneOtp,
    completeOnboarding,
    logout,
    refreshUser,
    isAuthenticated: !!user,
  }), [user, loading, error, isNewUser, pendingPhoneVerification,
    sendPhoneOtp, verifyPhoneOtp, completeOnboarding, logout, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
