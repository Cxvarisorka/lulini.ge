/**
 * DriverCluster
 *
 * Renders nearby driver markers with grid-based clustering when zoomed out.
 * iOS: JSX custom elements | Android: PNG images
 *
 * Props:
 *   drivers       Array<{ lat, lng }>  — nearby driver positions
 *   zoomLevel     number               — current map zoom (default 15)
 */
import React, { useMemo, memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const BASE_CLUSTER_RADIUS = 0.003;
const MIN_DRIVERS_TO_CLUSTER = 15;
const CLUSTER_ZOOM_THRESHOLD = 14;

// Stable anchor ref — prevents new object allocation triggering native marker
// re-configuration on every parent render cycle.
const ANCHOR_CENTER = { x: 0.5, y: 0.5 };

function clusterDrivers(drivers, zoomLevel) {
  if (!drivers || drivers.length === 0) return [];

  if (zoomLevel > CLUSTER_ZOOM_THRESHOLD || drivers.length < MIN_DRIVERS_TO_CLUSTER) {
    return drivers.map((d, i) => ({
      key: `d-${(d.lat * 100000 | 0)}_${(d.lng * 100000 | 0)}_${i}`,
      lat: d.lat,
      lng: d.lng,
      isCluster: false,
      count: 1,
    }));
  }

  const cellSize = BASE_CLUSTER_RADIUS * Math.pow(2, 15 - zoomLevel);
  const grid = new Map();

  for (const d of drivers) {
    const cellX = Math.floor(d.lng / cellSize);
    const cellY = Math.floor(d.lat / cellSize);
    const cellKey = `${cellX}:${cellY}`;

    if (!grid.has(cellKey)) {
      grid.set(cellKey, { sumLat: 0, sumLng: 0, count: 0 });
    }

    const cell = grid.get(cellKey);
    cell.sumLat += d.lat;
    cell.sumLng += d.lng;
    cell.count++;
  }

  const result = [];
  for (const [cellKey, cell] of grid) {
    const avgLat = cell.sumLat / cell.count;
    const avgLng = cell.sumLng / cell.count;

    if (cell.count > 1) {
      result.push({
        key: `cluster-${cellKey}`,
        lat: avgLat,
        lng: avgLng,
        isCluster: true,
        count: cell.count,
      });
    } else {
      result.push({
        key: `single-${cellKey}`,
        lat: avgLat,
        lng: avgLng,
        isCluster: false,
        count: 1,
      });
    }
  }

  return result;
}

/** Cluster count bubble — always JSX (dynamic text) */
const ClusterBubble = memo(({ coordinate, count }) => (
  <Marker
    coordinate={coordinate}
    anchor={ANCHOR_CENTER}
    tracksViewChanges={false}
    style={styles.clusterMarkerFixed}
    zIndex={3}
  >
    <View style={styles.clusterWrapper}>
      <View style={styles.clusterCircle}>
        <Text style={styles.clusterText}>{count}</Text>
      </View>
    </View>
  </Marker>
));
ClusterBubble.displayName = 'ClusterBubble';

/** Static car marker — image-based on both platforms for reliability */
const StaticCarMarker = memo(({ coordinate }) => (
  <Marker
    coordinate={coordinate}
    image={markerImages.car}
    anchor={ANCHOR_CENTER}
    flat={true}
    tracksViewChanges={false}
    zIndex={4}
  />
));
StaticCarMarker.displayName = 'StaticCarMarker';

const DriverCluster = memo(({ drivers = [], zoomLevel = 15 }) => {
  const items = useMemo(
    () => clusterDrivers(drivers, zoomLevel),
    [drivers, zoomLevel]
  );

  // PERF: Stabilize coordinate objects across renders.
  // Without this, every re-cluster creates new { latitude, longitude } objects,
  // causing all memo'd child markers to re-render (reference inequality).
  const coordCacheRef = React.useRef(new Map());
  const stableItems = useMemo(() => {
    const cache = coordCacheRef.current;
    const nextCache = new Map();
    const result = [];
    for (const item of items) {
      if (!isFinite(item.lat) || !isFinite(item.lng)) continue;
      const cached = cache.get(item.key);
      let coordinate;
      if (cached && cached.latitude === item.lat && cached.longitude === item.lng) {
        coordinate = cached; // Reuse same object reference
      } else {
        coordinate = { latitude: item.lat, longitude: item.lng };
      }
      nextCache.set(item.key, coordinate);
      result.push({ ...item, coordinate });
    }
    coordCacheRef.current = nextCache;
    return result;
  }, [items]);

  if (stableItems.length === 0) return null;

  return (
    <>
      {stableItems.map(item =>
        item.isCluster ? (
          <ClusterBubble
            key={item.key}
            coordinate={item.coordinate}
            count={item.count}
          />
        ) : (
          <StaticCarMarker
            key={item.key}
            coordinate={item.coordinate}
          />
        )
      )}
    </>
  );
}, (prev, next) => {
  // PERF: Deep-compare drivers by position to avoid re-clustering when
  // the parent passes a new array reference with identical coordinates.
  if (prev.zoomLevel !== next.zoomLevel) return false;
  const a = prev.drivers, b = next.drivers;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].lat !== b[i].lat || a[i].lng !== b[i].lng) return false;
  }
  return true;
});
DriverCluster.displayName = 'DriverCluster';

const styles = StyleSheet.create({
  clusterMarkerFixed: {
    width: 44,
    height: 44,
  },
  clusterWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A73E8',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {},
    }),
  },
  clusterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default DriverCluster;
