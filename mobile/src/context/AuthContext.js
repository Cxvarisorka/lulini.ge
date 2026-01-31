import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
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
        login,
        register,
        loginWithGoogle,
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
