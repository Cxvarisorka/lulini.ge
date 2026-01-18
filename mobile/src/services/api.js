import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// API URL Configuration
// For production:
// const API_URL = 'https://gotours.ge/api';

// For local development:
const API_URL = 'http://192.168.100.3:3000/api'; // Your local IP - physical device
// const API_URL = 'http://10.0.2.2:3000/api'; // Android emulator
// const API_URL = 'http://localhost:3000/api'; // iOS simulator

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and token extraction
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
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
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
};

// Taxi API
export const taxiAPI = {
  requestRide: (data) =>
    api.post('/rides', data),

  getMyRides: () =>
    api.get('/rides/my'),

  getRideById: (id) =>
    api.get(`/rides/${id}`),

  cancelRide: (id, reason) =>
    api.patch(`/rides/${id}/cancel`, { reason }),

  rateRide: (id, rating, review) =>
    api.post(`/rides/${id}/rate`, { rating, review }),
};

// Rental API
export const rentalAPI = {
  getCars: (params) =>
    api.get('/rentals/cars', { params }),

  getCarById: (id) =>
    api.get(`/rentals/cars/${id}`),

  getCategories: () =>
    api.get('/rentals/categories'),

  createBooking: (data) =>
    api.post('/rentals/bookings', data),

  getMyBookings: () =>
    api.get('/rentals/my-bookings'),

  getBookingById: (id) =>
    api.get(`/rentals/bookings/${id}`),

  cancelBooking: (id) =>
    api.patch(`/rentals/bookings/${id}/cancel`),
};

// Transfer API (kept for backwards compatibility)
export const transferAPI = {
  create: (data) =>
    api.post('/transfers', data),

  getMyTransfers: () =>
    api.get('/transfers/my'),

  getById: (id) =>
    api.get(`/transfers/${id}`),

  cancel: (id) =>
    api.patch(`/transfers/${id}/cancel`),
};

export { API_URL };
export default api;
