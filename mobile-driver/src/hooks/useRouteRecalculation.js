/**
 * useRouteRecalculation hook
 *
 * Monitors the driver's distance from the current route polyline.
 * When the driver goes off-route (>150m from any route point),
 * triggers a recalculation via OSRM.
 *
 * Throttled to max once every 15 seconds to avoid excessive API calls.
 *
 * Usage:
 *   const { checkOffRoute } = useRouteRecalculation();
 *
 *   useEffect(() => {
 *     if (driverLocation && destination && routePolyline) {
 *       checkOffRoute(driverLocation, destination, routePolyline)
 *         .then(newRoute => {
 *           if (newRoute) setRoutePolyline(newRoute.polyline);
 *         });
 *     }
 *   }, [driverLocation]);
 */

import { useRef, useCallback } from 'react';
import { getNavigationRoute } from '../services/directions';

const OFF_ROUTE_THRESHOLD_M = 150; // 150 meters
const RECALC_COOLDOWN_MS = 15000;  // 15 seconds

/**
 * Haversine distance between two {latitude, longitude} points in meters
 */
function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Find the minimum distance from a point to any point on a polyline.
 * Polyline is an array of [lat, lng] pairs.
 */
function minDistanceToPolyline(point, polyline) {
  let min = Infinity;

  for (const p of polyline) {
    // Polyline points can be [lat, lng] arrays or {latitude, longitude} objects
    const pLat = Array.isArray(p) ? p[0] : p.latitude;
    const pLng = Array.isArray(p) ? p[1] : p.longitude;

    const d = haversineM(point, { latitude: pLat, longitude: pLng });
    if (d < min) min = d;

    // Early exit — if we're close enough, no need to check more
    if (min < OFF_ROUTE_THRESHOLD_M * 0.5) break;
  }

  return min;
}

export default function useRouteRecalculation() {
  const lastRecalcRef = useRef(0);
  const isRecalculating = useRef(false);

  const checkOffRoute = useCallback(async (driverLocation, destination, routePolyline) => {
    if (!driverLocation || !destination || !routePolyline || routePolyline.length < 2) {
      return null;
    }

    // Don't overlap recalculations
    if (isRecalculating.current) return null;

    // Throttle
    const now = Date.now();
    if (now - lastRecalcRef.current < RECALC_COOLDOWN_MS) return null;

    const distance = minDistanceToPolyline(driverLocation, routePolyline);

    if (distance > OFF_ROUTE_THRESHOLD_M) {
      isRecalculating.current = true;
      lastRecalcRef.current = now;

      try {
        const newRoute = await getNavigationRoute(driverLocation, destination);
        return newRoute; // caller updates their polyline state
      } finally {
        isRecalculating.current = false;
      }
    }

    return null;
  }, []);

  return { checkOffRoute };
}
