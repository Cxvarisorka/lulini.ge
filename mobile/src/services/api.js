import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { getIsInternetReachable } from '../context/NetworkContext';

// API URL Configuration
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.gotours.ge/api';

// H1: Global 401 logout callback — set by AuthContext to trigger logout on token invalidation
let _onUnauthorized = null;
export const setOnUnauthorized = (callback) => { _onUnauthorized = callback; };

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor: auth token + offline short-circuit
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Block mutating requests when offline (GET may use cache / stale-while-revalidate)
    if (!getIsInternetReachable() && config.method !== 'get') {
      const err = new Error('No internet connection');
      err.code = 'ERR_OFFLINE';
      err.config = config;
      return Promise.reject(err);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: token extraction + retry on transient failures
api.interceptors.response.use(
  async (response) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const tokenCookie = setCookie.find(cookie => cookie.startsWith('token='));
      if (tokenCookie) {
        const token = tokenCookie.split('token=')[1].split(';')[0];
        if (token) {
          await SecureStore.setItemAsync('token', token);
        }
      }
    }
    return response;
  },
  async (error) => {
    // Offline errors are not retryable — surface immediately
    if (error.code === 'ERR_OFFLINE') return Promise.reject(error);

    const config = error.config;

    // 4xx = client error, never retry (except maybe 408/429, but we keep it simple)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      if (error.response.status === 401) {
        await SecureStore.deleteItemAsync('token');
        // H1: Trigger global logout so UI reflects token invalidation
        if (_onUnauthorized) _onUnauthorized();
      }
      return Promise.reject(error);
    }

    // Retry on 5xx or network error (ECONNABORTED, ERR_NETWORK, timeout)
    // Max 2 retries with linear backoff (1s, 2s)
    if (config && (error.response?.status >= 500 || !error.response)) {
      config._retryCount = (config._retryCount || 0) + 1;
      if (config._retryCount <= 2 && getIsInternetReachable()) {
        const delay = config._retryCount * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response;
  },

  register: async (data) => {
    const response = await api.post('/auth/register', data);
    return response;
  },

  logout: () =>
    api.post('/auth/logout'),

  getMe: () =>
    api.get('/auth/me'),

  googleAuth: (idToken) =>
    api.post('/auth/google/token', { idToken }),

  // Phone OTP authentication
  sendPhoneOtp: (phone) =>
    api.post('/auth/phone/send-otp', { phone }),

  verifyPhoneOtp: (phone, code, firstName, lastName) =>
    api.post('/auth/phone/verify-otp', { phone, code, firstName, lastName }),

  // Phone update (authenticated)
  sendPhoneUpdateOtp: (phone) =>
    api.post('/auth/phone/update-send-otp', { phone }),

  verifyPhoneUpdateOtp: (phone, code) =>
    api.post('/auth/phone/update-verify-otp', { phone, code }),

  // Apple Sign-In
  appleAuth: (identityToken, fullName, email) =>
    api.post('/auth/apple/token', { identityToken, fullName, email }),

  // Update email (authenticated)
  updateEmail: (email) =>
    api.patch('/auth/email', { email }),

  // Complete onboarding
  completeOnboarding: () =>
    api.post('/auth/complete-onboarding'),
};

// Taxi API
export const taxiAPI = {
  requestRide: (data, config) =>
    api.post('/rides', data, config),

  getMyRides: (params = {}) =>
    api.get('/rides/my', { params }),

  getRideById: (id) =>
    api.get(`/rides/${id}`),

  cancelRide: (id, reason, note) =>
    api.patch(`/rides/${id}/cancel`, { reason, note }),

  reviewDriver: (id, rating, review) =>
    api.post(`/rides/${id}/review`, { rating, review }),

  getNearbyDrivers: (lat, lng, vehicleType) =>
    api.get('/drivers/nearby', { params: { lat, lng, vehicleType } }),
};

// Settings API
export const settingsAPI = {
  getPricing: () =>
    api.get('/settings/pricing'),
};

// Payment API
export const paymentAPI = {
  registerCard: (lang) =>
    api.post('/payments/cards/register', { lang }),

  verifyCardRegistration: (orderId) =>
    api.post(`/payments/cards/verify/${orderId}`),

  getSavedCards: () =>
    api.get('/payments/cards'),

  deleteCard: (cardId) =>
    api.delete(`/payments/cards/${cardId}`),

  setDefaultCard: (cardId) =>
    api.patch(`/payments/cards/${cardId}/default`),

  // Pre-ride payment: charge card before requesting drivers
  preChargeRide: (cardId, amount, lang) =>
    api.post('/payments/ride/pre-charge', { cardId, amount, lang }),

  verifyRidePayment: (orderId) =>
    api.post(`/payments/ride/verify/${orderId}`),

  getPaymentStatus: (paymentId) =>
    api.get(`/payments/${paymentId}/status`),
};

export { API_URL };
export default api;
