import * as SecureStore from 'expo-secure-store';

const RIDE_STATE_KEY = 'active_ride_state';
const MAX_STALE_HOURS = 24;

/**
 * Persist minimal ride state to SecureStore (~400 bytes).
 * Called on every ride state transition (socket events, submission success).
 */
export const persistRideState = async (state) => {
  try {
    const payload = {
      rideId: state.rideId,
      status: state.status,
      bookingStep: state.bookingStep,
      pickup: state.pickup,
      dropoff: state.dropoff,
      vehicleType: state.vehicleType,
      paymentMethod: state.paymentMethod,
      estimatedPrice: state.estimatedPrice,
      estimatedDuration: state.estimatedDuration,
      driverLocation: state.driverLocation || null,
      driverName: state.driverName || null,
      driverVehicle: state.driverVehicle || null,
      totalDistance: state.totalDistance || null,
      savedAt: Date.now(),
    };
    await SecureStore.setItemAsync(RIDE_STATE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[RideStorage] persist failed:', e.message);
  }
};

/**
 * Load persisted ride state. Returns null if missing or stale (>24h).
 */
export const loadRideState = async () => {
  try {
    const raw = await SecureStore.getItemAsync(RIDE_STATE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw);

    // Discard stale state (ride surely resolved by now)
    if (Date.now() - state.savedAt > MAX_STALE_HOURS * 60 * 60 * 1000) {
      await clearRideState();
      return null;
    }

    return state;
  } catch (e) {
    console.warn('[RideStorage] load failed:', e.message);
    return null;
  }
};

/**
 * Clear persisted ride state (on completion, cancellation, or reset).
 */
export const clearRideState = async () => {
  try {
    await SecureStore.deleteItemAsync(RIDE_STATE_KEY);
  } catch (e) {
    console.warn('[RideStorage] clear failed:', e.message);
  }
};
