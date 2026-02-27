import { createContext, useContext } from 'react';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const { user } = useUser();
  const { socket } = useSocket();

  const value = {
    // Placeholder for future taxi admin features
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
