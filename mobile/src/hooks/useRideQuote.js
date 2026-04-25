import { useEffect, useRef, useState } from 'react';

import { taxiAPI } from '../services/api';

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 32;

const _cache = new Map();

function roundCoord(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function buildCacheKey({ pickup, dropoff, vehicleType }) {
  const pLat = roundCoord(pickup?.latitude);
  const pLng = roundCoord(pickup?.longitude);
  const dLat = roundCoord(dropoff?.latitude);
  const dLng = roundCoord(dropoff?.longitude);
  return `${pLat},${pLng}|${dLat},${dLng}|${vehicleType || ''}`;
}

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (_cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { data, ts: Date.now() });
}

export default function useRideQuote({ pickup, dropoff, vehicleType, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const pLat = roundCoord(pickup?.latitude);
  const pLng = roundCoord(pickup?.longitude);
  const dLat = roundCoord(dropoff?.latitude);
  const dLng = roundCoord(dropoff?.longitude);

  useEffect(() => {
    if (!enabled || !vehicleType || pLat == null || pLng == null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = buildCacheKey({ pickup, dropoff, vehicleType });
    const cached = getCached(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      taxiAPI
        .getQuote(
          {
            pickupLat: pLat,
            pickupLng: pLng,
            dropoffLat: dLat ?? undefined,
            dropoffLng: dLng ?? undefined,
            vehicleType,
          },
          { signal: controller.signal }
        )
        .then((res) => {
          if (controller.signal.aborted) return;
          const payload = res?.data?.data ?? null;
          if (payload) setCached(key, payload);
          setData(payload);
          setLoading(false);
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
          setError(err);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [enabled, pLat, pLng, dLat, dLng, vehicleType]);

  return { data, loading, error };
}
