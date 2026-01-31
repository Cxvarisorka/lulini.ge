import { createContext, useContext, useState, useEffect } from 'react';
import { tourService } from '../services/tour';

const ToursContext = createContext();

export function ToursProvider({ children }) {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    // Only fetch once when the provider mounts
    if (!fetched) {
      fetchTours();
    }
  }, [fetched]);

  const fetchTours = async () => {
    try {
      setLoading(true);
      const response = await tourService.getAllTours();
      setTours(response.data.tours || []);
      setFetched(true);
    } catch (error) {
      console.error('Error fetching tours:', error);
    } finally {
      setLoading(false);
    }
  };

  const refetchTours = () => {
    setFetched(false);
  };

  const value = {
    tours,
    loading,
    refetchTours,
  };

  return (
    <ToursContext.Provider value={value}>
      {children}
    </ToursContext.Provider>
  );
}

export function useTours() {
  const context = useContext(ToursContext);
  if (!context) {
    throw new Error('useTours must be used within a ToursProvider');
  }
  return context;
}
