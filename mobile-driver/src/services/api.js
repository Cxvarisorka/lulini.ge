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
};

// Driver endpoints
export const driverAPI = {
  getProfile: () => api.get('/drivers/profile'),
  updateStatus: (status) => api.patch('/drivers/status', { status }),
  updateLocation: (location) => api.patch('/drivers/location', location),
  batchUpdateLocation: (locations) => api.post('/drivers/location/batch', { locations }),
  getStats: () => api.get('/drivers/stats'),
  getEarnings: (period) => api.get(`/drivers/earnings?period=${period}`),
};

// Ride endpoints
export const rideAPI = {
  getMyRides: (params = {}) => api.get('/rides/driver/my', { params }),
  getAvailableRides: () => api.get('/rides/driver/available'),
  acceptRide: (rideId) => api.patch(`/rides/${rideId}/accept`),
  notifyArrival: (rideId) => api.patch(`/rides/${rideId}/arrive`),
  startRide: (rideId) => api.patch(`/rides/${rideId}/start`),
  completeRide: (rideId, fare) => api.patch(`/rides/${rideId}/complete`, { fare }),
  cancelRide: (rideId, reason) => api.patch(`/rides/${rideId}/cancel`, { reason }),
  getRideById: (rideId) => api.get(`/rides/${rideId}`),
};

export default api;
