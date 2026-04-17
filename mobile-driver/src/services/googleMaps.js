/**
 * Maps Client (driver app) — thin fetch wrapper over the server's /api/maps/*.
 *
 * All provider selection, caching, and fallback logic lives on the server.
 * Filename kept as googleMaps.js so existing imports don't need to change.
 */

import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';

async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync('token');
  } catch {
    return null;
  }
}

async function serverGet(path, params = {}) {
  const token = await getAuthToken();
  if (!token) return null;
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${API_URL}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data?.success ? data.data : null;
  } catch {
    return null;
  }
}

export async function getDirections(origin, destination) {
  if (!origin || !destination) return null;
  const data = await serverGet('/maps/directions', {
    originLat: origin.latitude, originLng: origin.longitude,
    destLat:   destination.latitude, destLng: destination.longitude,
  });
  if (!data) return null;
  return {
    distance:     data.distance ?? (data.distanceMeters / 1000),
    duration:     data.duration ?? Math.round(data.durationSeconds / 60),
    distanceText: data.distanceText || '',
    durationText: data.durationText || '',
    polyline:     data.polyline || [],
    provider:     data.provider || null,
  };
}

export const getDirectionsOSRM = getDirections;
