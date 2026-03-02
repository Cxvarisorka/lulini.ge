import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkContext = createContext();

// Module-level flag readable from non-React code (e.g. api.js interceptors)
let _isInternetReachable = true;
export const getIsInternetReachable = () => _isInternetReachable;

export const NetworkProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const isInternetReachableRef = useRef(true);

  // Track offline→online transitions for flush-on-reconnect callbacks
  const wasOfflineRef = useRef(false);
  const onReconnectCallbacksRef = useRef([]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? true;
      const reachable = state.isInternetReachable ?? connected;

      setIsConnected(connected);
      setIsInternetReachable(reachable);
      isInternetReachableRef.current = reachable;
      _isInternetReachable = reachable;

      // Fire reconnect callbacks on offline → online transition
      if (reachable && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        onReconnectCallbacksRef.current.forEach((cb) => {
          try { cb(); } catch (e) {
            console.warn('[Network] reconnect callback error:', e.message);
          }
        });
      }

      if (!reachable) {
        wasOfflineRef.current = true;
      }
    });

    return () => unsubscribe();
  }, []);

  // H5: Wrap onReconnect in useCallback (uses only refs, stable identity)
  const onReconnect = useCallback((callback) => {
    onReconnectCallbacksRef.current.push(callback);
    return () => {
      onReconnectCallbacksRef.current =
        onReconnectCallbacksRef.current.filter((cb) => cb !== callback);
    };
  }, []);

  // H5: Memoize context value
  const value = useMemo(() => ({
    isConnected,
    isInternetReachable,
    isInternetReachableRef,
    onReconnect,
  }), [isConnected, isInternetReachable, onReconnect]);

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
};
