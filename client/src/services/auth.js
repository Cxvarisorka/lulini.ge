import { apiRequest } from './api';

export const authService = {
  logout: () =>
    apiRequest('/auth/logout', { method: 'POST' }),

  getCurrentUser: () =>
    apiRequest('/auth/me'),
};
