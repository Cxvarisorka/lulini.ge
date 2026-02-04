import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { authAPI } from '../services/api';
import { GOOGLE_CONFIG } from '../config/google.config';

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

  const handleGoogleToken = async (idToken) => {
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
  };

  // Check for existing token on app load
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        const response = await authAPI.getMe();
        if (response.data.success) {
          setUser(response.data.data.user);
        }
      }
    } catch (err) {
      console.log('Auth check failed:', err.message);
      await SecureStore.deleteItemAsync('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.login(email, password);

      if (response.data.success) {
        // Get token from response body (updated server sends it)
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
  };

  const register = async (userData) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.register(userData);

      if (response.data.success) {
        // Get token from response body
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
  };

  const loginWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);

      if (!request) {
        setError('Google Sign-In is not ready');
        setLoading(false);
        return { success: false, error: 'Google Sign-In is not ready' };
      }

      // This will trigger the Google OAuth flow
      // The result will be handled by the useEffect watching 'response'
      const result = await promptAsync();

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setLoading(false);
        return { success: false, error: 'Google login was cancelled' };
      }

      // Success case is handled by the useEffect
      return { success: true };
    } catch (err) {
      const message = err.message || 'Google login failed';
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }
  };

  // Apple Sign-In
  const loginWithApple = async () => {
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
  };

  // Phone OTP - Send OTP
  const sendPhoneOtp = async (phone) => {
    try {
      setError(null);
      setLoading(true);

      const response = await authAPI.sendPhoneOtp(phone);

      if (response.data.success) {
        setPendingPhoneVerification(phone);
        return { success: true };
      }
      return { success: false, error: 'Failed to send OTP' };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send OTP';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  // Phone OTP - Verify OTP
  const verifyPhoneOtp = async (phone, code, fullName = null, email = null) => {
    try {
      setError(null);
      setLoading(true);

      const response = await authAPI.verifyPhoneOtp(phone, code, fullName, email);

      if (response.data.success) {
        // Check if this requires registration (new user without fullName)
        if (response.data.requiresRegistration) {
          return {
            success: true,
            requiresRegistration: true,
            phone
          };
        }

        // User is authenticated
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
    } finally {
      setLoading(false);
    }
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    try {
      await authAPI.completeOnboarding();
      setIsNewUser(false);
      if (user) {
        setUser({ ...user, hasCompletedOnboarding: true });
      }
    } catch (err) {
      console.log('Complete onboarding failed:', err.message);
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.log('Logout API error:', err.message);
    } finally {
      await SecureStore.deleteItemAsync('token');
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getMe();
      if (response.data.success) {
        setUser(response.data.data.user);
      }
    } catch (err) {
      console.log('Refresh user failed:', err.message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
