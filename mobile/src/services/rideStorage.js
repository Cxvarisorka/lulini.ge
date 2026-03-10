import * as SecureStore from 'expo-secure-store';

const RIDE_STATE_KEY = 'active_ride_state';
const LAST_DESTINATION_KEY = 'last_destination';
const MAX_STALE_HOURS = 24;
const MAX_DEST_STALE_DAYS = 30;

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
    if (__DEV__) console.warn('[RideStorage] persist failed:', e.message);
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
    if (__DEV__) console.warn('[RideStorage] load failed:', e.message);
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
    if (__DEV__) console.warn('[RideStorage] clear failed:', e.message);
  }
};

/**
 * Save the last used destination for quick re-selection.
 */
export const persistLastDestination = async (address, coords) => {
  try {
    const payload = { address, coords, savedAt: Date.now() };
    await SecureStore.setItemAsync(LAST_DESTINATION_KEY, JSON.stringify(payload));
  } catch (e) {
    if (__DEV__) console.warn('[RideStorage] persistLastDest failed:', e.message);
  }
};

/**
 * Load the last used destination. Returns null if missing or stale (>30 days).
 */
export const loadLastDestination = async () => {
  try {
    const raw = await SecureStore.getItemAsync(LAST_DESTINATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.savedAt > MAX_DEST_STALE_DAYS * 24 * 60 * 60 * 1000) {
      await SecureStore.deleteItemAsync(LAST_DESTINATION_KEY);
      return null;
    }
    return data;
  } catch (e) {
    if (__DEV__) console.warn('[RideStorage] loadLastDest failed:', e.message);
    return null;
  }
};
