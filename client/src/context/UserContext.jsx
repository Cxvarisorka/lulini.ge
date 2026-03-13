import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';
import { setToken } from '../services/api';

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
    // Capture token from OAuth redirect URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

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
        setToken(null);
        setUser(defaultUser);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Login user
  const login = async (email, password) => {
    const res = await authService.login(email, password);
    if (res.token) setToken(res.token);
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
    if (res.token) setToken(res.token);
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
    setToken(null);
    setUser(defaultUser);
  };

  // Update user profile
  const updateProfile = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
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
