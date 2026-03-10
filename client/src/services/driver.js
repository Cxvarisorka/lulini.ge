const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Helper for API requests
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
    });

    // Try to parse JSON response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // If not JSON, get text
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error('Server returned non-JSON response: ' + text.substring(0, 100));
    }

    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
}

export const driverService = {
  // Get all drivers
  getAll: async () => {
    return apiRequest('/drivers');
  },

  // Get single driver
  getById: async (id) => {
    return apiRequest(`/drivers/${id}`);
  },

  // Create new driver
  create: async (driverData) => {
    return apiRequest('/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(driverData),
    });
  },

  // Update driver
  update: async (id, updates) => {
    return apiRequest(`/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  // Delete driver
  delete: async (id) => {
    const response = await apiRequest(`/drivers/${id}`, {
      method: 'DELETE',
    });
    if (!response.success) {
      throw new Error(response.message || 'Failed to delete driver');
    }
    return response;
  },

  // Get all driver statistics (Admin)
  getAllStatistics: async () => {
    return apiRequest('/drivers/admin/statistics');
  },

  // Get driver 7-day activity (Admin)
  getActivity: async (id) => {
    return apiRequest(`/drivers/${id}/activity`);
  },

  // Get driver reviews (Admin)
  getReviews: async (id) => {
    return apiRequest(`/drivers/${id}/reviews`);
  },

  // Upload driver photo (Admin)
  uploadPhoto: async (id, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await fetch(`${API_URL}/drivers/${id}/photo`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload photo');
    }
    return data;
  },
};
