import { apiRequest } from './api';

export const locationsService = {
  getCostMetrics: async (days = 7) => {
    return apiRequest(`/locations/cost-metrics?days=${days}`);
  },
  getProviderStats: async () => {
    return apiRequest('/locations/provider-stats');
  },
};
