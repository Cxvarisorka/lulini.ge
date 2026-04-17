/**
 * Navigation helpers for driver app.
 *
 * getNavigationRoute: fetches turn-by-turn data from /api/maps/directions?steps=true.
 *                    Server handles OSRM→Google fallback + caching.
 * formatDistance / formatDuration / getManeuverIcon / getManeuverInstruction:
 *                    pure UI helpers, kept local.
 */

import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';

async function getAuthToken() {
  try { return await SecureStore.getItemAsync('token'); } catch { return null; }
}

export async function getNavigationRoute(origin, destination) {
  if (!origin || !destination) return null;
  const token = await getAuthToken();
  if (!token) return null;

  const params = new URLSearchParams({
    originLat: origin.latitude,
    originLng: origin.longitude,
    destLat:   destination.latitude,
    destLng:   destination.longitude,
    steps: 'true',
  }).toString();

  try {
    const res = await fetch(`${API_URL}/maps/directions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data?.success) return null;

    const d = data.data;
    // Server unified step shape: { distanceMeters, durationSeconds, name, maneuver:{type,modifier,location:[lat,lng]}, geometry:[[lat,lng],...] }
    const steps = (d.steps || []).map((s, i) => ({
      index: i,
      maneuver: {
        type: s.maneuver?.type,
        modifier: s.maneuver?.modifier || null,
        location: s.maneuver?.location || null,
      },
      name: s.name || '',
      distance: s.distanceMeters ?? 0,
      duration: s.durationSeconds ?? 0,
      geometry: s.geometry || [],
    }));

    return {
      distance:     d.distanceMeters ?? (d.distance * 1000),
      duration:     d.durationSeconds ?? (d.duration * 60),
      distanceText: d.distanceText || formatDistance(d.distanceMeters),
      durationText: d.durationText || formatDuration(d.durationSeconds),
      polyline:     d.polyline || [],
      steps,
    };
  } catch {
    return null;
  }
}

// ── Pure UI helpers ─────────────────────────────────────────────────────────

export function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

export function getManeuverIcon(type, modifier) {
  if (type === 'depart') return 'navigate';
  if (type === 'arrive') return 'flag';
  if (type === 'roundabout' || type === 'rotary') return 'refresh';
  switch (modifier) {
    case 'left':        return 'arrow-back';
    case 'sharp left':  return 'return-down-back';
    case 'slight left': return 'arrow-back';
    case 'right':       return 'arrow-forward';
    case 'sharp right': return 'return-down-forward';
    case 'slight right':return 'arrow-forward';
    case 'uturn':       return 'arrow-undo';
    case 'straight':
    default:            return 'arrow-up';
  }
}

export function getManeuverInstruction(step, t) {
  const { type, modifier } = step.maneuver;
  const streetName = step.name;

  if (type === 'depart') {
    return t ? t('nav.depart', { street: streetName || '' }) : `Head on ${streetName || 'the road'}`;
  }
  if (type === 'arrive') {
    return t ? t('nav.arrive') : 'You have arrived';
  }

  const directionKey = modifier ? modifier.replace(/ /g, '_') : 'straight';
  if (t) {
    return streetName
      ? t(`nav.${directionKey}_onto`, { street: streetName })
      : t(`nav.${directionKey}`);
  }
  const directionText = modifier || 'straight';
  return streetName
    ? `Turn ${directionText} onto ${streetName}`
    : `Continue ${directionText}`;
}

export function clearRouteCache() { /* server owns cache */ }
