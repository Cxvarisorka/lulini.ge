import { apiRequest } from './api';

export const settingsService = {
  getPricing: async () => {
    return apiRequest('/settings/pricing');
  },

  updatePricing: async (data) => {
    return apiRequest('/settings/pricing', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};
