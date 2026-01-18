import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';
import { transferService } from '../services/transfer';
import { rentalService } from '../services/rental';

const UserContext = createContext(null);

const defaultUser = {
  id: null,
  name: '',
  email: '',
  phone: '',
  avatar: null,
  isLoggedIn: false,
  createdAt: null
};

export function UserProvider({ children }) {
  const [user, setUser] = useState(defaultUser);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    authService.getCurrentUser()
      .then((res) => {
        const userData = res.data.user;
        setUser({
          id: userData.id,
          name: `${userData.firstName} ${userData.lastName}`.trim(),
          email: userData.email,
          phone: userData.phone || '',
          avatar: userData.avatar,
          role: userData.role,
          isLoggedIn: true,
          createdAt: userData.createdAt
        });
      })
      .catch(() => {
        setUser(defaultUser);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const [userOrders, setUserOrders] = useState({ transfers: [], rentals: [] });

  // Fetch user's transfers when logged in
  const fetchUserTransfers = async () => {
    if (!user.isLoggedIn) return;
    try {
      const res = await transferService.getMyTransfers();
      setUserOrders(prev => ({
        ...prev,
        transfers: res.data.transfers
      }));
    } catch (error) {
      console.error('Failed to fetch transfers:', error);
    }
  };

  // Fetch user's rental orders when logged in
  const fetchUserRentalOrders = async () => {
    if (!user.isLoggedIn) return;
    try {
      const res = await rentalService.getMyOrders();
      setUserOrders(prev => ({
        ...prev,
        rentals: res.data.orders
      }));
    } catch (error) {
      console.error('Failed to fetch rental orders:', error);
    }
  };

  // Fetch orders when user logs in
  useEffect(() => {
    if (user.isLoggedIn) {
      fetchUserTransfers();
      fetchUserRentalOrders();
    }
  }, [user.isLoggedIn]);

  // Login user
  const login = async (email, password) => {
    const res = await authService.login(email, password);
    const userData = res.data.user;
    const newUser = {
      id: userData.id,
      name: `${userData.firstName} ${userData.lastName}`.trim(),
      email: userData.email,
      phone: userData.phone || '',
      avatar: userData.avatar,
      role: userData.role,
      isLoggedIn: true,
      createdAt: userData.createdAt
    };
    setUser(newUser);
    return newUser;
  };

  // Register user
  const register = async (userData) => {
    const res = await authService.register(userData);
    const user = res.data.user;
    const newUser = {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      phone: user.phone || '',
      avatar: user.avatar,
      role: user.role,
      isLoggedIn: true,
      createdAt: user.createdAt
    };
    setUser(newUser);
    return newUser;
  };

  // Logout user
  const logout = async () => {
    await authService.logout();
    setUser(defaultUser);
  };

  // Update user profile
  const updateProfile = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  // Add transfer order for user (via API)
  const addUserTransferOrder = async (orderData) => {
    const res = await transferService.create(orderData);
    const newOrder = res.data.transfer;
    setUserOrders(prev => ({
      ...prev,
      transfers: [newOrder, ...prev.transfers]
    }));
    return newOrder;
  };

  // Cancel a transfer order
  const cancelUserTransferOrder = async (orderId) => {
    const res = await transferService.cancel(orderId);
    const updatedOrder = res.data.transfer;
    setUserOrders(prev => ({
      ...prev,
      transfers: prev.transfers.map(o =>
        o._id === orderId ? updatedOrder : o
      )
    }));
    return updatedOrder;
  };

  // Add rental order for user (via API)
  const addUserRentalOrder = async (orderData) => {
    const res = await rentalService.createOrder(orderData);
    const newOrder = res.data.order;
    setUserOrders(prev => ({
      ...prev,
      rentals: [newOrder, ...prev.rentals]
    }));
    return newOrder;
  };

  // Cancel a rental order
  const cancelUserRentalOrder = async (orderId) => {
    const res = await rentalService.cancelOrder(orderId);
    const updatedOrder = res.data.order;
    setUserOrders(prev => ({
      ...prev,
      rentals: prev.rentals.map(o =>
        o._id === orderId ? updatedOrder : o
      )
    }));
    return updatedOrder;
  };

  // Get user's transfer orders
  const getUserTransferOrders = () => {
    return userOrders.transfers;
  };

  // Get user's rental orders
  const getUserRentalOrders = () => {
    return userOrders.rentals;
  };

  // Get order statistics
  const getOrderStats = () => {
    const transfers = getUserTransferOrders();
    const rentals = getUserRentalOrders();

    return {
      totalOrders: transfers.length + rentals.length,
      totalTransfers: transfers.length,
      totalRentals: rentals.length,
      completedTransfers: transfers.filter(o => o.status === 'completed').length,
      completedRentals: rentals.filter(o => o.status === 'completed').length,
      pendingOrders: transfers.filter(o => o.status === 'pending').length +
                     rentals.filter(o => o.status === 'pending').length,
      totalSpent: transfers.reduce((sum, o) => sum + (o.quote?.total || 0), 0) +
                  rentals.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    };
  };

  // Sync order status from admin context
  const syncOrderStatus = (orderId, status, type) => {
    if (type === 'transfer') {
      setUserOrders(prev => ({
        ...prev,
        transfers: prev.transfers.map(o =>
          o.id === orderId ? { ...o, status } : o
        )
      }));
    } else {
      setUserOrders(prev => ({
        ...prev,
        rentals: prev.rentals.map(o =>
          o.id === orderId ? { ...o, status } : o
        )
      }));
    }
  };

  const value = {
    user,
    userOrders,
    loading,
    login,
    register,
    logout,
    updateProfile,
    addUserTransferOrder,
    cancelUserTransferOrder,
    addUserRentalOrder,
    cancelUserRentalOrder,
    getUserTransferOrders,
    getUserRentalOrders,
    getOrderStats,
    syncOrderStatus,
    fetchUserTransfers,
    fetchUserRentalOrders,
    isLoggedIn: user.isLoggedIn
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
