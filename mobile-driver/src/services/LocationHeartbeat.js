/**
 * LocationHeartbeat — 30s keepalive when driver is stationary.
 *
 * Prevents server watchdog false positives at red lights / traffic.
 * The server differentiates heartbeat from movement:
 * - heartbeat → resets watchdog timer, does NOT create route point
 * - movement  → resets watchdog AND creates route point
 */

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

export default class LocationHeartbeat {
  /**
   * @param {Function} sendFn - (heartbeatData) => void — called every 30s with last known position
   */
  constructor(sendFn) {
    this.sendFn = sendFn;
    this.lastLocation = null;
    this._interval = null;
  }

  start() {
    this.stop(); // Clear any existing interval
    this._interval = setInterval(() => {
      if (this.lastLocation && this.sendFn) {
        this.sendFn({
          ...this.lastLocation,
          type: 'heartbeat',
          ts: Date.now(),
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Update the last known location (called from location watcher).
   */
  updateLocation(loc) {
    this.lastLocation = loc;
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** Check if heartbeat is running. */
  get isRunning() {
    return this._interval !== null;
  }
}
