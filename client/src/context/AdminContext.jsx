import { createContext, useContext, useState, useEffect } from 'react';
import { cityLocations, categories } from '../data/rentalCars';
import { transferService } from '../services/transfer';
import { rentalService } from '../services/rental';
import { tourService } from '../services/tour';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';

const AdminContext = createContext(null);

const defaultTransferPricing = {
  baseRatePerKm: 2,
  minimumCharge: 25,
  vehicleMultipliers: {
    economy: 1,
    business: 1.5,
    firstClass: 2.5,
    van: 1.8,
    minibus: 2.2
  }
};

export function AdminProvider({ children }) {
  const { user } = useUser();
  const { socket } = useSocket();
  const [cars, setCars] = useState([]);
  const [tours, setTours] = useState([]);
  const [transferPricing, setTransferPricing] = useState(defaultTransferPricing);
  const [transferOrders, setTransferOrders] = useState([]);
  const [rentalOrders, setRentalOrders] = useState([]);
  const [tourOrders, setTourOrders] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [loadingCars, setLoadingCars] = useState(false);
  const [loadingTours, setLoadingTours] = useState(false);
  const [loadingRentalOrders, setLoadingRentalOrders] = useState(false);
  const [loadingTourOrders, setLoadingTourOrders] = useState(false);

  // ============ FETCH FUNCTIONS ============

  // Fetch all cars (public - for display)
  const fetchCars = async (filters = {}) => {
    setLoadingCars(true);
    try {
      const res = await rentalService.getAllCars(filters);
      setCars(res.data.cars);
    } catch (error) {
      console.error('Failed to fetch cars:', error);
    } finally {
      setLoadingCars(false);
    }
  };

  // Fetch all transfers for admin
  const fetchTransferOrders = async (status = 'all') => {
    if (user?.role !== 'admin') return;
    setLoadingTransfers(true);
    try {
      const res = await transferService.getAll(status);
      setTransferOrders(res.data.transfers);
    } catch (error) {
      console.error('Failed to fetch transfers:', error);
    } finally {
      setLoadingTransfers(false);
    }
  };

  // Fetch all rental orders for admin
  const fetchRentalOrders = async (status = 'all') => {
    if (user?.role !== 'admin') return;
    setLoadingRentalOrders(true);
    try {
      const res = await rentalService.getAllOrders(status);
      setRentalOrders(res.data.orders);
    } catch (error) {
      console.error('Failed to fetch rental orders:', error);
    } finally {
      setLoadingRentalOrders(false);
    }
  };

  // Fetch all tours (public - for display)
  const fetchTours = async (filters = {}) => {
    setLoadingTours(true);
    try {
      const res = await tourService.getAllTours(filters);
      setTours(res.data.tours);
    } catch (error) {
      console.error('Failed to fetch tours:', error);
    } finally {
      setLoadingTours(false);
    }
  };

  // Fetch all tour orders for admin
  const fetchTourOrders = async (status = 'all') => {
    if (user?.role !== 'admin') return;
    setLoadingTourOrders(true);
    try {
      const res = await tourService.getAllOrders(status);
      setTourOrders(res.data.orders);
    } catch (error) {
      console.error('Failed to fetch tour orders:', error);
    } finally {
      setLoadingTourOrders(false);
    }
  };

  // Fetch cars and tours on mount (public data)
  useEffect(() => {
    fetchCars();
    fetchTours();
  }, []);

  // Fetch orders when admin user logs in
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchTransferOrders();
      fetchRentalOrders();
      fetchTourOrders();
    }
  }, [user?.role]);

  // ============ REAL-TIME SOCKET LISTENERS ============

  useEffect(() => {
    if (!socket || user?.role !== 'admin') return;

    // Transfer events
    const handleTransferCreated = (transfer) => {
      console.log('Real-time: New transfer created', transfer._id);
      setTransferOrders(prev => {
        if (prev.some(t => t._id === transfer._id)) return prev;
        return [transfer, ...prev];
      });
    };

    const handleTransferUpdated = (transfer) => {
      console.log('Real-time: Transfer updated', transfer._id);
      setTransferOrders(prev => prev.map(order =>
        order._id === transfer._id ? transfer : order
      ));
    };

    const handleTransferDeleted = ({ _id }) => {
      console.log('Real-time: Transfer deleted', _id);
      setTransferOrders(prev => prev.filter(order => order._id !== _id));
    };

    // Rental order events
    const handleRentalOrderCreated = (order) => {
      console.log('Real-time: New rental order created', order._id);
      setRentalOrders(prev => {
        if (prev.some(o => o._id === order._id)) return prev;
        return [order, ...prev];
      });
    };

    const handleRentalOrderUpdated = (order) => {
      console.log('Real-time: Rental order updated', order._id);
      setRentalOrders(prev => prev.map(o =>
        o._id === order._id ? order : o
      ));
    };

    const handleRentalOrderDeleted = ({ _id }) => {
      console.log('Real-time: Rental order deleted', _id);
      setRentalOrders(prev => prev.filter(o => o._id !== _id));
    };

    // Car events
    const handleCarCreated = (car) => {
      console.log('Real-time: New car created', car._id);
      setCars(prev => {
        if (prev.some(c => c._id === car._id)) return prev;
        return [car, ...prev];
      });
    };

    const handleCarUpdated = (car) => {
      console.log('Real-time: Car updated', car._id);
      setCars(prev => prev.map(c =>
        c._id === car._id ? car : c
      ));
    };

    const handleCarDeleted = ({ _id }) => {
      console.log('Real-time: Car deleted', _id);
      setCars(prev => prev.filter(c => c._id !== _id));
    };

    // Tour events
    const handleTourCreated = (tour) => {
      console.log('Real-time: New tour created', tour._id);
      setTours(prev => {
        if (prev.some(t => t._id === tour._id)) return prev;
        return [tour, ...prev];
      });
    };

    const handleTourUpdated = (tour) => {
      console.log('Real-time: Tour updated', tour._id);
      setTours(prev => prev.map(t =>
        t._id === tour._id ? tour : t
      ));
    };

    const handleTourDeleted = ({ _id }) => {
      console.log('Real-time: Tour deleted', _id);
      setTours(prev => prev.filter(t => t._id !== _id));
    };

    // Tour order events
    const handleTourOrderCreated = (order) => {
      console.log('Real-time: New tour order created', order._id);
      setTourOrders(prev => {
        if (prev.some(o => o._id === order._id)) return prev;
        return [order, ...prev];
      });
    };

    const handleTourOrderUpdated = (order) => {
      console.log('Real-time: Tour order updated', order._id);
      setTourOrders(prev => prev.map(o =>
        o._id === order._id ? order : o
      ));
    };

    const handleTourOrderDeleted = ({ _id }) => {
      console.log('Real-time: Tour order deleted', _id);
      setTourOrders(prev => prev.filter(o => o._id !== _id));
    };

    // Subscribe to events
    socket.on('transfer:created', handleTransferCreated);
    socket.on('transfer:updated', handleTransferUpdated);
    socket.on('transfer:deleted', handleTransferDeleted);
    socket.on('rentalOrder:created', handleRentalOrderCreated);
    socket.on('rentalOrder:updated', handleRentalOrderUpdated);
    socket.on('rentalOrder:deleted', handleRentalOrderDeleted);
    socket.on('car:created', handleCarCreated);
    socket.on('car:updated', handleCarUpdated);
    socket.on('car:deleted', handleCarDeleted);
    socket.on('tour:created', handleTourCreated);
    socket.on('tour:updated', handleTourUpdated);
    socket.on('tour:deleted', handleTourDeleted);
    socket.on('tourOrder:created', handleTourOrderCreated);
    socket.on('tourOrder:updated', handleTourOrderUpdated);
    socket.on('tourOrder:deleted', handleTourOrderDeleted);

    return () => {
      socket.off('transfer:created', handleTransferCreated);
      socket.off('transfer:updated', handleTransferUpdated);
      socket.off('transfer:deleted', handleTransferDeleted);
      socket.off('rentalOrder:created', handleRentalOrderCreated);
      socket.off('rentalOrder:updated', handleRentalOrderUpdated);
      socket.off('rentalOrder:deleted', handleRentalOrderDeleted);
      socket.off('car:created', handleCarCreated);
      socket.off('car:updated', handleCarUpdated);
      socket.off('car:deleted', handleCarDeleted);
      socket.off('tour:created', handleTourCreated);
      socket.off('tour:updated', handleTourUpdated);
      socket.off('tour:deleted', handleTourDeleted);
      socket.off('tourOrder:created', handleTourOrderCreated);
      socket.off('tourOrder:updated', handleTourOrderUpdated);
      socket.off('tourOrder:deleted', handleTourOrderDeleted);
    };
  }, [socket, user?.role]);

  // ============ CAR CRUD OPERATIONS ============

  const addCar = async (carData, imageFile, galleryFiles) => {
    const res = await rentalService.createCar(carData, imageFile, galleryFiles);
    const newCar = res.data.car;
    // Only add to state if socket is not connected (to avoid duplicate from socket event)
    if (!socket) {
      setCars(prev => [newCar, ...prev]);
    }
    return newCar;
  };

  const updateCar = async (id, carData, imageFile, galleryFiles) => {
    const res = await rentalService.updateCar(id, carData, imageFile, galleryFiles);
    const updatedCar = res.data.car;
    setCars(prev => prev.map(car =>
      car._id === id ? updatedCar : car
    ));
    return updatedCar;
  };

  const deleteCar = async (id) => {
    await rentalService.deleteCar(id);
    setCars(prev => prev.filter(car => car._id !== id));
  };

  const getCarById = (id) => {
    return cars.find(car => car._id === id || car.id === id);
  };

  // ============ TRANSFER PRICING OPERATIONS ============

  const updateTransferPricing = (updates) => {
    setTransferPricing(prev => ({ ...prev, ...updates }));
  };

  const updateVehicleMultiplier = (vehicleId, multiplier) => {
    setTransferPricing(prev => ({
      ...prev,
      vehicleMultipliers: {
        ...prev.vehicleMultipliers,
        [vehicleId]: multiplier
      }
    }));
  };

  const resetPricing = () => {
    setTransferPricing(defaultTransferPricing);
  };

  // ============ TRANSFER ORDER OPERATIONS ============

  const updateTransferOrderStatus = async (id, status) => {
    const res = await transferService.updateStatus(id, status);
    const updatedOrder = res.data.transfer;
    setTransferOrders(prev => prev.map(order =>
      order._id === id ? updatedOrder : order
    ));
    return updatedOrder;
  };

  const deleteTransferOrder = async (id) => {
    await transferService.delete(id);
    setTransferOrders(prev => prev.filter(order => order._id !== id));
  };

  // ============ RENTAL ORDER OPERATIONS ============

  const updateRentalOrderStatus = async (id, status) => {
    const res = await rentalService.updateOrderStatus(id, status);
    const updatedOrder = res.data.order;
    setRentalOrders(prev => prev.map(order =>
      order._id === id ? updatedOrder : order
    ));
    return updatedOrder;
  };

  const deleteRentalOrder = async (id) => {
    await rentalService.deleteOrder(id);
    setRentalOrders(prev => prev.filter(order => order._id !== id));
  };

  // ============ TOUR CRUD OPERATIONS ============

  const addTour = async (tourData, imageFile, galleryFiles) => {
    const res = await tourService.createTour(tourData, imageFile, galleryFiles);
    const newTour = res.data.tour;
    if (!socket) {
      setTours(prev => [newTour, ...prev]);
    }
    return newTour;
  };

  const updateTour = async (id, tourData, imageFile, galleryFiles) => {
    const res = await tourService.updateTour(id, tourData, imageFile, galleryFiles);
    const updatedTour = res.data.tour;
    if (!socket) {
      setTours(prev => prev.map(t => t._id === id ? updatedTour : t));
    }
    return updatedTour;
  };

  const removeTour = async (id) => {
    await tourService.deleteTour(id);
    if (!socket) {
      setTours(prev => prev.filter(t => t._id !== id));
    }
  };

  const getTourById = (id) => {
    return tours.find(t => t._id === id || t.id === id);
  };

  // ============ TOUR ORDER OPERATIONS ============

  const updateTourOrderStatus = async (id, status) => {
    const res = await tourService.updateOrderStatus(id, status);
    const updatedOrder = res.data.order;
    setTourOrders(prev => prev.map(order =>
      order._id === id ? updatedOrder : order
    ));
    return updatedOrder;
  };

  const deleteTourOrder = async (id) => {
    await tourService.deleteOrder(id);
    setTourOrders(prev => prev.filter(order => order._id !== id));
  };

  // ============ STATS ============

  const getStats = () => {
    const totalCars = cars.length;
    const availableCars = cars.filter(c => c.available).length;
    const unavailableCars = totalCars - availableCars;

    const byCategory = categories
      .filter(c => c.id !== 'all')
      .map(cat => ({
        ...cat,
        count: cars.filter(c => c.category === cat.id).length
      }));

    const byLocation = cityLocations.map(loc => ({
      ...loc,
      count: cars.filter(c => c.locationId === loc.id).length
    }));

    const pendingTransferOrders = transferOrders.filter(o => o.status === 'pending').length;
    const pendingRentalOrders = rentalOrders.filter(o => o.status === 'pending').length;
    const pendingTourOrders = tourOrders.filter(o => o.status === 'pending').length;

    return {
      totalCars,
      availableCars,
      unavailableCars,
      byCategory,
      byLocation,
      pendingTransferOrders,
      pendingRentalOrders,
      pendingTourOrders,
      totalTransferOrders: transferOrders.length,
      totalRentalOrders: rentalOrders.length,
      totalTourOrders: tourOrders.length,
      totalTours: tours.length
    };
  };

  const value = {
    // Data
    cars,
    tours,
    transferPricing,
    cityLocations,
    categories: categories.filter(c => c.id !== 'all'),
    transferOrders,
    rentalOrders,
    tourOrders,
    loadingTransfers,
    loadingCars,
    loadingTours,
    loadingRentalOrders,
    loadingTourOrders,

    // Car operations
    fetchCars,
    addCar,
    updateCar,
    deleteCar,
    getCarById,

    // Tour operations
    fetchTours,
    addTour,
    updateTour,
    removeTour,
    getTourById,

    // Pricing operations
    updateTransferPricing,
    updateVehicleMultiplier,
    resetPricing,

    // Transfer order operations
    fetchTransferOrders,
    updateTransferOrderStatus,
    deleteTransferOrder,

    // Rental order operations
    fetchRentalOrders,
    updateRentalOrderStatus,
    deleteRentalOrder,

    // Tour order operations
    fetchTourOrders,
    updateTourOrderStatus,
    deleteTourOrder,

    // Stats
    getStats
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}

export { AdminContext };
