import { apiRequest } from './api';

export const transferService = {
    // Create a new transfer booking (requires login)
    create: (transferData) => {
        return apiRequest('/transfers', {
            method: 'POST',
            body: JSON.stringify(transferData)
        });
    },

    // Get current user's transfers
    getMyTransfers: () => {
        return apiRequest('/transfers/my');
    },

    // Get single transfer by ID
    getById: (id) => {
        return apiRequest(`/transfers/${id}`);
    },

    // Cancel a transfer (user)
    cancel: (id) => {
        return apiRequest(`/transfers/${id}/cancel`, {
            method: 'PATCH'
        });
    },

    // Admin: Get all transfers
    getAll: (status = 'all') => {
        const query = status !== 'all' ? `?status=${status}` : '';
        return apiRequest(`/transfers${query}`);
    },

    // Admin: Update transfer status
    updateStatus: (id, status) => {
        return apiRequest(`/transfers/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    },

    // Admin: Delete transfer
    delete: (id) => {
        return apiRequest(`/transfers/${id}`, {
            method: 'DELETE'
        });
    }
};
