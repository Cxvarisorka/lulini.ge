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

export const rentalService = {
    // ============ CAR OPERATIONS ============

    // Get all cars (public)
    getAllCars: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.location) params.append('location', filters.location);
        if (filters.available !== undefined) params.append('available', filters.available);
        if (filters.search) params.append('search', filters.search);

        const query = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/cars${query}`);
    },

    // Get single car by ID (public)
    getCarById: (id) => {
        return apiRequest(`/cars/${id}`);
    },

    // Create new car (admin) - with image upload
    createCar: (carData, imageFile, galleryFiles) => {
        const formData = new FormData();

        // Add all car data fields
        Object.keys(carData).forEach(key => {
            if (key === 'features') {
                formData.append(key, JSON.stringify(carData[key]));
            } else if (carData[key] !== undefined && carData[key] !== null) {
                formData.append(key, carData[key]);
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

        return apiFormDataRequest('/cars', formData, 'POST');
    },

    // Update car (admin) - with optional image upload
    updateCar: (id, carData, imageFile, galleryFiles) => {
        const formData = new FormData();

        // Add all car data fields
        Object.keys(carData).forEach(key => {
            if (key === 'features' || key === 'images') {
                formData.append(key, JSON.stringify(carData[key]));
            } else if (carData[key] !== undefined && carData[key] !== null) {
                formData.append(key, carData[key]);
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

        return apiFormDataRequest(`/cars/${id}`, formData, 'PATCH');
    },

    // Delete car (admin)
    deleteCar: (id) => {
        return apiRequest(`/cars/${id}`, { method: 'DELETE' });
    },

    // Upload additional images to car (admin)
    uploadCarImages: (id, files) => {
        const formData = new FormData();
        files.forEach(file => {
            formData.append('images', file);
        });
        return apiFormDataRequest(`/cars/${id}/images`, formData, 'POST');
    },

    // Delete car image (admin)
    deleteCarImage: (id, imageUrl) => {
        return apiRequest(`/cars/${id}/images`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl })
        });
    },

    // ============ RENTAL ORDER OPERATIONS ============

    // Create rental order (user)
    createOrder: (orderData) => {
        return apiRequest('/rental-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
    },

    // Get current user's orders
    getMyOrders: () => {
        return apiRequest('/rental-orders/my');
    },

    // Get single order by ID
    getOrderById: (id) => {
        return apiRequest(`/rental-orders/${id}`);
    },

    // Cancel order (user)
    cancelOrder: (id) => {
        return apiRequest(`/rental-orders/${id}/cancel`, { method: 'PATCH' });
    },

    // Get all orders (admin)
    getAllOrders: (status = 'all') => {
        const query = status !== 'all' ? `?status=${status}` : '';
        return apiRequest(`/rental-orders${query}`);
    },

    // Update order status (admin)
    updateOrderStatus: (id, status) => {
        return apiRequest(`/rental-orders/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
    },

    // Delete order (admin)
    deleteOrder: (id) => {
        return apiRequest(`/rental-orders/${id}`, { method: 'DELETE' });
    }
};
