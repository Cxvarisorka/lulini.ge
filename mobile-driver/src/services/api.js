import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.3:3000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // Increased timeout for slower networks
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
      console.log('Error getting token:', error);
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
      // Token expired or invalid
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
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
  getStats: () => api.get('/drivers/stats'),
  getEarnings: (period) => api.get(`/drivers/earnings?period=${period}`),
};

// Ride endpoints
export const rideAPI = {
  getMyRides: (status) => api.get(`/rides/driver/my${status ? `?status=${status}` : ''}`),
  acceptRide: (rideId) => api.patch(`/rides/${rideId}/accept`),
  startRide: (rideId) => api.patch(`/rides/${rideId}/start`),
  completeRide: (rideId, fare) => api.patch(`/rides/${rideId}/complete`, { fare }),
  cancelRide: (rideId, reason) => api.patch(`/rides/${rideId}/cancel`, { reason }),
  getRideById: (rideId) => api.get(`/rides/${rideId}`),
};

export default api;
