import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { authEvents } from './authEvents';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Remove withCredentials for mobile - we use Bearer tokens instead
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('[API] Failed to get token from secure store:', error.message);
      return Promise.reject(new Error('Failed to retrieve authentication token'));
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear storage and notify AuthContext
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      authEvents.emit('force-logout');
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  register: (data) => api.post('/auth/register', data),
  sendPhoneOtp: (data) => api.post('/auth/phone/send-otp', data),
  verifyPhoneOtp: (data) => api.post('/auth/phone/verify-otp', data),
  sendPhoneUpdateOtp: (data) => api.post('/auth/phone/update-send-otp', data),
  verifyPhoneUpdateOtp: (data) => api.post('/auth/phone/update-verify-otp', data),
  sendEmailVerification: (email, language) => api.post('/auth/email/send-verification', { email, language }),
  verifyEmailForRegistration: (email, code) => api.post('/auth/email/verify-registration', { email, code }),
  sendRegistrationPhoneOtp: (phone) => api.post('/auth/phone/send-registration-otp', { phone }),
  verifyRegistrationPhoneOtp: (phone, code) => api.post('/auth/phone/verify-registration-otp', { phone, code }),
  forgotPasswordSendOtp: (data) => api.post('/auth/forgot-password/send-otp', data),
  forgotPasswordReset: (data) => api.post('/auth/forgot-password/reset', data),
};

// Driver endpoints
export const driverAPI = {
  getProfile: () => api.get('/drivers/profile'),
  updateStatus: (status) => api.patch('/drivers/status', { status }),
  updateLocation: (location) => api.patch('/drivers/location', location),
  batchUpdateLocation: (locations) => api.post('/drivers/location/batch', { locations }),
  getStats: () => api.get('/drivers/stats'),
  getEarnings: (period) => api.get(`/drivers/earnings?period=${period}`),
  // Self-registration and onboarding
  registerDriver: (data) => api.post('/drivers/register', data),
  uploadDocument: (type, formData) => api.post(`/drivers/documents/${type}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getDocuments: () => api.get('/drivers/documents'),
  getOnboardingStatus: () => api.get('/drivers/onboarding-status'),
};

// Ride endpoints
export const rideAPI = {
  getMyRides: (params = {}) => api.get('/rides/driver/my', { params }),
  getAvailableRides: () => api.get('/rides/driver/available'),
  acceptRide: (rideId) => api.patch(`/rides/${rideId}/accept`),
  declineRide: (rideId, reason) => api.patch(`/rides/${rideId}/decline`, reason ? { reason } : {}),
  notifyArrival: (rideId) => api.patch(`/rides/${rideId}/arrive`),
  // Idempotent ride start — includes idempotency key to handle network retries
  startRide: (rideId, idempotencyKey) => api.patch(`/rides/${rideId}/start`, {
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }),
  completeRide: (rideId, fare) => api.patch(`/rides/${rideId}/complete`, { fare }),
  cancelRide: (rideId, reason) => api.patch(`/rides/${rideId}/cancel`, { reason }),
  getRideById: (rideId) => api.get(`/rides/${rideId}`),
  // Ride location batch — send buffered route points for ride reconstruction
  sendLocationBatch: (rideId, points, meta = {}) => api.post(`/rides/${rideId}/locations/batch`, {
    points,
    ...meta,
  }),
  // Rate a passenger after a completed ride
  reviewPassenger: (rideId, rating, review) =>
    api.post(`/rides/${rideId}/review-passenger`, { rating, review }),
};

// Chat endpoints
export const chatAPI = {
  sendMessage: (rideId, content) =>
    api.post(`/chat/rides/${rideId}/messages`, { content }),
  getMessages: (rideId, page = 1, limit = 50) =>
    api.get(`/chat/rides/${rideId}/messages`, { params: { page, limit } }),
  markAsRead: (rideId, messageId) =>
    api.patch(`/chat/rides/${rideId}/messages/read`, { messageId }),
};

// Account management endpoints
export const accountAPI = {
  deleteAccount: (password) =>
    api.delete('/auth/account', { data: { password } }),
  cancelDeletion: () => api.delete('/auth/account/cancel'),
};

export default api;
