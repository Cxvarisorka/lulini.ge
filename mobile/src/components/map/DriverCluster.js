/**
 * DriverCluster
 *
 * Renders nearby driver markers with grid-based clustering when zoomed out.
 * Optimized for 50–200 active drivers without overwhelming the map.
 *
 * When zoom < 14 and there are 15+ drivers, nearby drivers are grouped
 * into cluster bubbles showing a count. When zoomed in, individual
 * AnimatedCarMarker components are rendered.
 *
 * Props:
 *   drivers       Array<{ lat, lng }>  — nearby driver positions
 *   zoomLevel     number               — current map zoom (default 15)
 */
import React, { useMemo, memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

// Cluster radius in degrees — scales with zoom level
const BASE_CLUSTER_RADIUS = 0.003; // ~300m at equator
const MIN_DRIVERS_TO_CLUSTER = 15;
const CLUSTER_ZOOM_THRESHOLD = 14;

/**
 * Grid-based clustering algorithm.
 * Groups drivers whose lat/lng fall within the same grid cell.
 */
function clusterDrivers(drivers, zoomLevel) {
  if (!drivers || drivers.length === 0) return [];

  // Don't cluster when zoomed in or few drivers
  if (zoomLevel > CLUSTER_ZOOM_THRESHOLD || drivers.length < MIN_DRIVERS_TO_CLUSTER) {
    return drivers.map((d, i) => ({
      // Coordinate-based key (5-decimal ~ 1m) prevents marker flicker when
      // the driver array reorders between API fetches. Index suffix is a
      // tiebreaker for drivers at the same location (same rounded coords).
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
    // Quantize position to grid cell
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

/**
 * Cluster count marker — shows number of grouped drivers
 */
const ClusterBubble = memo(({ coordinate, count }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    tracksViewChanges={false}
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

/**
 * Simple static car marker for individual nearby drivers.
 * Uses a plain Marker (no AnimatedRegion) to avoid AIRMapMarker errors.
 */
const StaticCarMarker = memo(({ coordinate }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    flat={true}
    tracksViewChanges={false}
    zIndex={4}
  >
    <View style={styles.carWrapper}>
      <View style={styles.carCircle}>
        <Ionicons name="car-sport" size={15} color="#fff" />
      </View>
    </View>
  </Marker>
));
StaticCarMarker.displayName = 'StaticCarMarker';

/**
 * Main export — renders clustered or individual driver markers
 */
const DriverCluster = memo(({ drivers = [], zoomLevel = 15 }) => {
  const items = useMemo(
    () => clusterDrivers(drivers, zoomLevel),
    [drivers, zoomLevel]
  );

  if (items.length === 0) return null;

  return (
    <>
      {items.map(item => {
        const lat = item.lat;
        const lng = item.lng;
        if (!isFinite(lat) || !isFinite(lng)) return null;
        const coordinate = { latitude: lat, longitude: lng };

        return item.isCluster ? (
          <ClusterBubble
            key={item.key}
            coordinate={coordinate}
            count={item.count}
          />
        ) : (
          <StaticCarMarker
            key={item.key}
            coordinate={coordinate}
          />
        );
      })}
    </>
  );
});
DriverCluster.displayName = 'DriverCluster';

const styles = StyleSheet.create({
  clusterWrapper: {
    // 60px for 36px circle = 12px padding per side.
    // Was 48px (6px padding) — too tight, caused Android bitmap clipping
    // of the 2.5px border. Transparent padding is free in the bitmap.
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  clusterCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#374151',
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
  carWrapper: {
    // 56px for 30px circle = 13px padding per side
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  carCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#374151',
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
});

export default DriverCluster;
