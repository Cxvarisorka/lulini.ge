const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Helper for API requests
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

// Helper for FormData requests (file uploads)
async function apiFormDataRequest(endpoint, formData, method = 'POST') {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        body: formData,
        credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

export const tourService = {
    // ============ TOUR OPERATIONS ============

    // Get all tours (public)
    getAllTours: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.location) params.append('location', filters.location);
        if (filters.available !== undefined) params.append('available', filters.available);
        if (filters.featured !== undefined) params.append('featured', filters.featured);
        if (filters.search) params.append('search', filters.search);

        const query = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/tours${query}`);
    },

    // Get single tour by ID (public)
    getTourById: (id) => {
        return apiRequest(`/tours/${id}`);
    },

    // Create new tour (admin) - with image upload
    createTour: (tourData, imageFile, galleryFiles) => {
        const formData = new FormData();

        // Add all tour data fields
        Object.keys(tourData).forEach(key => {
            const arrayFields = ['includes', 'excludes', 'availableDays', 'languages', 'itinerary'];
            if (arrayFields.includes(key)) {
                formData.append(key, JSON.stringify(tourData[key]));
            } else if (tourData[key] !== undefined && tourData[key] !== null) {
                formData.append(key, tourData[key]);
            }
        });

        // Add main image
        if (imageFile) {
            formData.append('image', imageFile);
        }

        // Add gallery images
        if (galleryFiles && galleryFiles.length > 0) {
            galleryFiles.forEach(file => {
                formData.append('images', file);
            });
        }

        return apiFormDataRequest('/tours', formData, 'POST');
    },

    // Update tour (admin) - with optional image upload
    updateTour: (id, tourData, imageFile, galleryFiles) => {
        const formData = new FormData();

        // Add all tour data fields
        Object.keys(tourData).forEach(key => {
            const arrayFields = ['includes', 'excludes', 'availableDays', 'languages', 'itinerary', 'images'];
            if (arrayFields.includes(key)) {
                formData.append(key, JSON.stringify(tourData[key]));
            } else if (tourData[key] !== undefined && tourData[key] !== null) {
                formData.append(key, tourData[key]);
            }
        });

        // Add main image if provided
        if (imageFile) {
            formData.append('image', imageFile);
        }

        // Add gallery images if provided
        if (galleryFiles && galleryFiles.length > 0) {
            galleryFiles.forEach(file => {
                formData.append('images', file);
            });
        }

        return apiFormDataRequest(`/tours/${id}`, formData, 'PATCH');
    },

    // Delete tour (admin)
    deleteTour: (id) => {
        return apiRequest(`/tours/${id}`, { method: 'DELETE' });
    },

    // Delete tour image (admin)
    deleteTourImage: (id, imageUrl) => {
        return apiRequest(`/tours/${id}/images`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl })
        });
    },

    // ============ TOUR ORDER OPERATIONS ============

    // Create tour order (user)
    createOrder: (orderData) => {
        return apiRequest('/tour-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
    },

    // Get current user's orders
    getMyOrders: () => {
        return apiRequest('/tour-orders/my');
    },

    // Get single order by ID
    getOrderById: (id) => {
        return apiRequest(`/tour-orders/${id}`);
    },

    // Cancel order (user)
    cancelOrder: (id) => {
        return apiRequest(`/tour-orders/${id}/cancel`, { method: 'PATCH' });
    },

    // Get all orders (admin)
    getAllOrders: (status = 'all') => {
        const query = status !== 'all' ? `?status=${status}` : '';
        return apiRequest(`/tour-orders${query}`);
    },

    // Update order status (admin)
    updateOrderStatus: (id, status) => {
        return apiRequest(`/tour-orders/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
    },

    // Delete order (admin)
    deleteOrder: (id) => {
        return apiRequest(`/tour-orders/${id}`, { method: 'DELETE' });
    }
};
