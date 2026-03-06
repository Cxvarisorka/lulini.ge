// Simple event emitter for auth events (force-logout from 401 interceptor)
// Used to bridge the gap between the axios interceptor (non-React) and AuthContext (React)
const listeners = new Map();

export const authEvents = {
  on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
  },
  emit(event, data) {
    listeners.get(event)?.forEach((cb) => cb(data));
  },
};
