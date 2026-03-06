import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { authAPI, setOnUnauthorized } from '../services/api';
import { GOOGLE_CONFIG } from '../config/google.config';
import { registerForPushNotifications, unregisterPushToken } from '../services/pushNotifications';
import { clearAllCaches } from '../services/googleMaps';
import i18n from '../i18n';

// Complete any pending auth session
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState(null);

  // Google Auth configuration using expo-auth-session
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CONFIG.webClientId,
    androidClientId: GOOGLE_CONFIG.androidClientId,
    iosClientId: GOOGLE_CONFIG.iosClientId,
  });

  // Handle Google auth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleToken(id_token);
    } else if (response?.type === 'error') {
      setError('Google login failed');
      setLoading(false);
    }
  }, [response]);

  const handleGoogleToken = useCallback(async (idToken) => {
    try {
      setLoading(true);
      // Send the ID token to backend for verification
      const apiResponse = await authAPI.googleAuth(idToken);

      if (apiResponse.data.success) {
        const token = apiResponse.data.token;

        if (token) {
          await SecureStore.setItemAsync('token', token);
        }

        setUser(apiResponse.data.data.user);
      } else {
        setError('Google login failed');
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Google login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check for existing token on app load (M3: cancellation flag)
  useEffect(() => {
    let isCancelled = false;

    const checkAuthStatus = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const response = await authAPI.getMe();
          if (response.data.success && !isCancelled) {
            setUser(response.data.data.user);
          }
        }
      } catch (err) {
        // Only delete token on explicit 401 — network errors should keep the token
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

  // Register push token when user authenticates
  useEffect(() => {
    if (user) {
      registerForPushNotifications(i18n.language).catch(() => {});
    }
  }, [user]);

  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.login(email, password);

      if (response.data.success) {
        const token = response.data.token;

        if (token) {
          await SecureStore.setItemAsync('token', token);
        }

        setUser(response.data.data.user);
        return { success: true };
      }
      return { success: false, error: 'Login failed' };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (userData) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.register(userData);

      if (response.data.success) {
        const token = response.data.token;

        if (token) {
          await SecureStore.setItemAsync('token', token);
        }

        setUser(response.data.data.user);
        return { success: true };
      }
      return { success: false, error: 'Registration failed' };
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed. Please try again.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      if (!request) {
        setError('Google Sign-In is not ready');
        setLoading(false);
        return { success: false, error: 'Google Sign-In is not ready' };
      }

      const result = await promptAsync();

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setLoading(false);
        return { success: false, error: 'Google login was cancelled' };
      }

      return { success: true };
    } catch (err) {
      const message = err.message || 'Google login failed';
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }
  }, [request, promptAsync]);

  // Apple Sign-In
  const loginWithApple = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Check if Apple Sign-In is available (iOS only)
      if (Platform.OS !== 'ios') {
        setLoading(false);
        return { success: false, error: 'Apple Sign-In is only available on iOS' };
      }

      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        setLoading(false);
        return { success: false, error: 'Apple Sign-In is not available on this device' };
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Get full name from credential (only provided on first sign-in)
      const fullName = credential.fullName
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : null;

      // Send identity token to backend
      const apiResponse = await authAPI.appleAuth(
        credential.identityToken,
        fullName,
        credential.email
      );

      if (apiResponse.data.success) {
        const token = apiResponse.data.token;
        if (token) {
          await SecureStore.setItemAsync('token', token);
        }
        setUser(apiResponse.data.data.user);
        setIsNewUser(apiResponse.data.isNewUser || false);
        return { success: true, isNewUser: apiResponse.data.isNewUser };
      }

      return { success: false, error: 'Apple login failed' };
    } catch (err) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        setLoading(false);
        return { success: false, error: 'Apple login was cancelled' };
      }
      const message = err.response?.data?.message || err.message || 'Apple login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

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
  const verifyPhoneOtp = useCallback(async (phone, code, firstName = null, lastName = null) => {
    try {
      setError(null);

      const response = await authAPI.verifyPhoneOtp(phone, code, firstName, lastName);

      if (response.data.success) {
        if (response.data.requiresRegistration) {
          return {
            success: true,
            requiresRegistration: true,
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
      // L12: Clear map caches on logout
      clearAllCaches();
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
    login,
    register,
    loginWithGoogle,
    loginWithApple,
    sendPhoneOtp,
    verifyPhoneOtp,
    completeOnboarding,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    googleAuthReady: !!request,
  }), [user, loading, error, isNewUser, pendingPhoneVerification, request,
    login, register, loginWithGoogle, loginWithApple, sendPhoneOtp,
    verifyPhoneOtp, completeOnboarding, logout, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
