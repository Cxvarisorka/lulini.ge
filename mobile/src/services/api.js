import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { getIsInternetReachable } from '../context/NetworkContext';

// API URL Configuration
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';

// H1: Global 401 logout callback — set by AuthContext to trigger logout on token invalidation
let _onUnauthorized = null;
export const setOnUnauthorized = (callback) => { _onUnauthorized = callback; };

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
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
    try {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        // set-cookie can be a string or an array depending on platform
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
        if (tokenCookie) {
          const token = tokenCookie.split('token=')[1].split(';')[0];
          if (token) {
            await SecureStore.setItemAsync('token', token);
          }
        }
      }
    } catch (e) {
      // Never crash on cookie parsing — token will be refreshed on next auth call
      if (__DEV__) console.warn('[api] cookie parse error:', e.message);
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

  verifyPhoneOtp: (phone, code, firstName, lastName, verificationToken) =>
    api.post('/auth/phone/verify-otp', { phone, code, firstName, lastName, verificationToken }),

  // Phone update (authenticated)
  sendPhoneUpdateOtp: (phone) =>
    api.post('/auth/phone/update-send-otp', { phone }),

  verifyPhoneUpdateOtp: (phone, code) =>
    api.post('/auth/phone/update-verify-otp', { phone, code }),

  // Apple Sign-In
  appleAuth: (identityToken, fullName, email) =>
    api.post('/auth/apple/token', { identityToken, fullName, email }),

  // Email verification (authenticated — add/update email)
  sendEmailCode: (email) =>
    api.post('/auth/email/send-code', { email }),

  verifyEmailCode: (email, code) =>
    api.post('/auth/email/verify-code', { email, code }),

  // Email verification (unauthenticated — for registration)
  sendEmailVerification: (email) =>
    api.post('/auth/email/send-verification', { email }),

  verifyEmailForRegistration: (email, code) =>
    api.post('/auth/email/verify-registration', { email, code }),

  // Update profile (firstName, lastName)
  updateProfile: (firstName, lastName) =>
    api.patch('/auth/profile', { firstName, lastName }),

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

  getScheduledRides: () =>
    api.get('/rides/scheduled'),
};

// Safety API
export const safetyAPI = {
  addEmergencyContact: (data) => api.post('/safety/emergency-contacts', data),
  getEmergencyContacts: () => api.get('/safety/emergency-contacts'),
  updateEmergencyContact: (id, data) => api.patch(`/safety/emergency-contacts/${id}`, data),
  deleteEmergencyContact: (id) => api.delete(`/safety/emergency-contacts/${id}`),
  triggerSOS: (data) => api.post('/safety/sos', data),
  resolveSOSAlert: (id, data) => api.patch(`/safety/sos/${id}/resolve`, data),
  shareRide: (rideId) => api.post(`/safety/rides/${rideId}/share`),
};

// Chat API
export const chatAPI = {
  sendMessage: (rideId, content) => api.post(`/chat/rides/${rideId}/messages`, { content }),
  getMessages: (rideId, page = 1, limit = 50) => api.get(`/chat/rides/${rideId}/messages`, { params: { page, limit } }),
  markAsRead: (rideId, messageId) => api.patch(`/chat/rides/${rideId}/messages/read`, { messageId }),
};

// Favorites API
export const favoritesAPI = {
  getFavorites: () => api.get('/favorites'),
  addFavorite: (data) => api.post('/favorites', data),
  updateFavorite: (id, data) => api.patch(`/favorites/${id}`, data),
  deleteFavorite: (id) => api.delete(`/favorites/${id}`),
};

// Receipt API
export const receiptAPI = {
  getReceipt: (rideId) => api.get(`/receipts/rides/${rideId}/receipt`),
};

// Account API
export const accountAPI = {
  deleteAccount: (password) => api.delete('/auth/account', { data: { password } }),
  cancelDeletion: () => api.delete('/auth/account/cancel'),
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

  // Pre-ride payment: charge saved card before requesting drivers
  chargeRide: (cardId, amount, rideId, lang) =>
    api.post('/payments/ride/charge', { cardId, amount, rideId, lang }),

  // One-time payment (card / Apple Pay / Google Pay) without saved card
  payRide: (amount, rideId, paymentMethods, lang) =>
    api.post('/payments/ride/pay', { amount, rideId, paymentMethods, lang }),

  // Preauthorize ride payment (hold funds on saved card)
  preauthRide: (cardId, amount, lang) =>
    api.post('/payments/ride/preauth', { cardId, amount, lang }),

  // Approve preauthorized payment after ride completion
  approveRidePayment: (paymentId, amount, rideId) =>
    api.post(`/payments/ride/approve/${paymentId}`, { amount, rideId }),

  // Reject/cancel preauthorized payment
  rejectRidePayment: (paymentId, reason) =>
    api.post(`/payments/ride/reject/${paymentId}`, { reason }),

  verifyRidePayment: (orderId) =>
    api.post(`/payments/ride/verify/${orderId}`),

  getPaymentStatus: (paymentId) =>
    api.get(`/payments/${paymentId}/status`),

  getPaymentHistory: (page = 1, limit = 20) =>
    api.get('/payments/history', { params: { page, limit } }),
};

// Trip share API
export const tripShareAPI = {
  getShareLink: (rideId) =>
    api.get(`/rides/${rideId}/share`),
};

export { API_URL };
export default api;
