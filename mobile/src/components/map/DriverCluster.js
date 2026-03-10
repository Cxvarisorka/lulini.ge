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
    anchor={{ x: 0.5, y: 0.5 }}
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
    anchor={{ x: 0.5, y: 0.5 }}
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
