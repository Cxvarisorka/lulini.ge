import { createContext, useContext, useState } from 'react';
import { rentalCars as defaultCars, cityLocations, categories } from '../data/rentalCars';

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
  const [cars, setCars] = useState(defaultCars);
  const [transferPricing, setTransferPricing] = useState(defaultTransferPricing);
  const [transferOrders, setTransferOrders] = useState([]);
  const [rentalOrders, setRentalOrders] = useState([]);

  // Car CRUD operations
  const addCar = (car) => {
    const newCar = {
      ...car,
      id: car.id || `${car.brand.toLowerCase()}-${car.model.toLowerCase()}-${Date.now()}`
    };
    setCars(prev => [...prev, newCar]);
    return newCar;
  };

  const updateCar = (id, updates) => {
    setCars(prev => prev.map(car =>
      car.id === id ? { ...car, ...updates } : car
    ));
  };

  const deleteCar = (id) => {
    setCars(prev => prev.filter(car => car.id !== id));
  };

  const getCarById = (id) => {
    return cars.find(car => car.id === id);
  };

  // Transfer pricing operations
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

  // Reset to defaults
  const resetCars = () => {
    setCars(defaultCars);
  };

  const resetPricing = () => {
    setTransferPricing(defaultTransferPricing);
  };

  // Transfer order operations
  const addTransferOrder = (order) => {
    const newOrder = {
      ...order,
      id: `TR-${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    setTransferOrders(prev => [newOrder, ...prev]);
    return newOrder;
  };

  const updateTransferOrder = (id, updates) => {
    setTransferOrders(prev => prev.map(order =>
      order.id === id ? { ...order, ...updates } : order
    ));
  };

  const deleteTransferOrder = (id) => {
    setTransferOrders(prev => prev.filter(order => order.id !== id));
  };

  // Rental order operations
  const addRentalOrder = (order) => {
    const newOrder = {
      ...order,
      id: `RO-${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    setRentalOrders(prev => [newOrder, ...prev]);
    return newOrder;
  };

  const updateRentalOrder = (id, updates) => {
    setRentalOrders(prev => prev.map(order =>
      order.id === id ? { ...order, ...updates } : order
    ));
  };

  const deleteRentalOrder = (id) => {
    setRentalOrders(prev => prev.filter(order => order.id !== id));
  };

  // Stats for dashboard
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

    return {
      totalCars,
      availableCars,
      unavailableCars,
      byCategory,
      byLocation,
      pendingTransferOrders,
      pendingRentalOrders,
      totalTransferOrders: transferOrders.length,
      totalRentalOrders: rentalOrders.length
    };
  };

  const value = {
    // Data
    cars,
    transferPricing,
    cityLocations,
    categories: categories.filter(c => c.id !== 'all'),
    transferOrders,
    rentalOrders,

    // Car operations
    addCar,
    updateCar,
    deleteCar,
    getCarById,
    resetCars,

    // Pricing operations
    updateTransferPricing,
    updateVehicleMultiplier,
    resetPricing,

    // Transfer order operations
    addTransferOrder,
    updateTransferOrder,
    deleteTransferOrder,

    // Rental order operations
    addRentalOrder,
    updateRentalOrder,
    deleteRentalOrder,

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
