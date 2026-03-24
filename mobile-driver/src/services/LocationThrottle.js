/**
 * LocationThrottle — Cross-platform software throttle for location updates.
 *
 * iOS does not support time-based intervals in CLLocationManager, only distanceFilter.
 * This class provides consistent time + distance gating on both platforms.
 *
 * Usage:
 *   const throttle = new LocationThrottle({ minTimeMs: 3000, minDistanceM: 10 });
 *   if (throttle.shouldSend(location)) { ... }
 */
import { haversineM } from '../utils/distance';

export default class LocationThrottle {
  /**
   * @param {Object} opts
   * @param {number} opts.minTimeMs  - Minimum ms between accepted locations (default 3000)
   * @param {number} opts.minDistanceM - Minimum meters moved between accepted locations (default 10)
   */
  constructor({ minTimeMs = 3000, minDistanceM = 10 } = {}) {
    this.minTimeMs = minTimeMs;
    this.minDistanceM = minDistanceM;
    this.lastSent = null;     // { lat, lng }
    this.lastSentTime = 0;
  }

  /**
   * Check if this location should be sent to the server.
   * Both time AND distance gates must pass.
   * @param {{ lat: number, lng: number }} location
   * @returns {boolean}
   */
  shouldSend(location) {
    const now = Date.now();

    // Always send first update
    if (!this.lastSent) {
      this._accept(location, now);
      return true;
    }

    // Time gate: reject if too soon
    if (now - this.lastSentTime < this.minTimeMs) {
      return false;
    }

    // Distance gate: reject if too close
    const dist = haversineM(
      this.lastSent.lat,
      this.lastSent.lng,
      location.lat,
      location.lng,
    );
    if (dist < this.minDistanceM) {
      return false;
    }

    this._accept(location, now);
    return true;
  }

  /**
   * Force-send a location (ride start, ride end, significant heading change).
   * Resets throttle state.
   */
  forceSend(location) {
    this._accept(location, Date.now());
  }

  /**
   * Update throttle parameters (e.g., when transitioning ride phases).
   */
  updateParams({ minTimeMs, minDistanceM }) {
    if (minTimeMs !== undefined) this.minTimeMs = minTimeMs;
    if (minDistanceM !== undefined) this.minDistanceM = minDistanceM;
  }

  /** Reset throttle (e.g., on ride end). */
  reset() {
    this.lastSent = null;
    this.lastSentTime = 0;
  }

  _accept(location, now) {
    this.lastSent = { lat: location.lat, lng: location.lng };
    this.lastSentTime = now;
  }
}
