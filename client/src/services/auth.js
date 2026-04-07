import { apiRequest } from './api';

export const authService = {
  login: (email, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    apiRequest('/auth/logout', { method: 'POST' }),

  getCurrentUser: () =>
    apiRequest('/auth/me'),
};
