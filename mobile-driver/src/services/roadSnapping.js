/**
 * Road Snapping Service for Driver App
 *
 * Uses the server-proxied Google Roads API to snap raw GPS points
 * to the nearest road segment. This produces smoother driver tracks
 * for passenger-side visualization.
 *
 * Usage:
 *   import { createRoadSnapper } from './roadSnapping';
 *   const snapper = createRoadSnapper();
 *
 *   // Call on each GPS update:
 *   const snapped = await snapper.addPoint({ latitude, longitude });
 *   // snapped is null until batch threshold is reached, then returns
 *   // an array of snapped {latitude, longitude} points.
 */

import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

// Batch size — Google Roads allows up to 100, but we batch smaller for lower latency
const BATCH_SIZE = 10;
// Minimum interval between snap requests (ms)
const MIN_SNAP_INTERVAL = 30000; // 30 seconds

/**
 * Snap an array of GPS points to roads via server proxy
 * @param {Array<{latitude, longitude}>} points
 * @returns {Promise<Array<{latitude, longitude}>|null>}
 */
export async function snapPointsToRoad(points) {
  if (!points || points.length < 2) return null;

  try {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return null;

    const path = points.map(p => `${p.latitude},${p.longitude}`).join('|');

    const response = await fetch(
      `${API_URL}/maps/snap-to-road?path=${encodeURIComponent(path)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const data = await response.json();

    if (data.success && data.data?.snappedPoints?.length > 0) {
      return data.data.snappedPoints.map(p => ({
        latitude: p.location.latitude,
        longitude: p.location.longitude,
      }));
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Creates a batching road snapper that accumulates GPS points
 * and periodically snaps them to roads.
 *
 * @returns {{ addPoint, flush, reset }}
 */
export function createRoadSnapper() {
  let buffer = [];
  let lastSnapTime = 0;

  return {
    /**
     * Add a GPS point. Returns snapped points when batch is ready, null otherwise.
     */
    async addPoint(point) {
      buffer.push(point);

      const now = Date.now();
      const timeSinceLast = now - lastSnapTime;

      if (buffer.length >= BATCH_SIZE && timeSinceLast >= MIN_SNAP_INTERVAL) {
        return this.flush();
      }

      return null;
    },

    /**
     * Force-snap all buffered points immediately.
     */
    async flush() {
      if (buffer.length < 2) return null;

      const points = [...buffer];
      buffer = [buffer[buffer.length - 1]]; // Keep last point for continuity
      lastSnapTime = Date.now();

      return snapPointsToRoad(points);
    },

    /**
     * Clear the buffer (e.g. when ride ends).
     */
    reset() {
      buffer = [];
      lastSnapTime = 0;
    },
  };
}
