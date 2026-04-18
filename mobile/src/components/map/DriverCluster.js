/**
 * DriverCluster
 *
 * Renders nearby driver markers with grid-based clustering when zoomed out.
 *
 * Mapbox implementation: a single `<Mapbox.ShapeSource>` carrying one Feature
 * per cluster (with a `count` property) or single driver, plus two
 * `<Mapbox.SymbolLayer>`s — one filtered to clusters (`['has', 'count']`) using
 * the cluster-bg image with text overlay, and one for singles using the car
 * marker image.
 *
 * The clustering math is unchanged from the prior react-native-maps version.
 */
import { memo, useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

import { imageIdFor, markerImages } from './markerImages';

const BASE_CLUSTER_RADIUS = 0.003;
const MIN_DRIVERS_TO_CLUSTER = 15;
const CLUSTER_ZOOM_THRESHOLD = 14;

function clusterDrivers(drivers, zoomLevel) {
  if (!drivers || drivers.length === 0) return [];

  if (zoomLevel > CLUSTER_ZOOM_THRESHOLD || drivers.length < MIN_DRIVERS_TO_CLUSTER) {
    return drivers.map((d, i) => ({
      key: `d-${(d.lat * 100000) | 0}_${(d.lng * 100000) | 0}_${i}`,
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
    if (!grid.has(cellKey)) grid.set(cellKey, { sumLat: 0, sumLng: 0, count: 0 });
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
      result.push({ key: `cluster-${cellKey}`, lat: avgLat, lng: avgLng, isCluster: true, count: cell.count });
    } else {
      result.push({ key: `single-${cellKey}`, lat: avgLat, lng: avgLng, isCluster: false, count: 1 });
    }
  }
  return result;
}

const DriverCluster = memo(
  ({ drivers = [], zoomLevel = 15 }) => {
    const features = useMemo(() => {
      const items = clusterDrivers(drivers, zoomLevel);
      const out = [];
      for (const item of items) {
        if (!isFinite(item.lat) || !isFinite(item.lng)) continue;
        const properties = item.isCluster
          ? { count: item.count, label: String(item.count) }
          : {};
        out.push({
          type: 'Feature',
          id: item.key,
          geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
          properties,
        });
      }
      return { type: 'FeatureCollection', features: out };
    }, [drivers, zoomLevel]);

    if (features.features.length === 0) return null;

    const carImageId = imageIdFor(markerImages.car);
    const clusterBgImageId = imageIdFor(markerImages.clusterBg);

    return (
      <Mapbox.ShapeSource id="driver-cluster-src" shape={features}>
        {/* Singles — plain car PNG */}
        {carImageId ? (
          <Mapbox.SymbolLayer
            id="driver-cluster-single"
            filter={['!', ['has', 'count']]}
            style={{
              iconImage: carImageId,
              iconAnchor: 'center',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconRotationAlignment: 'viewport',
              symbolSortKey: 4,
            }}
          />
        ) : null}
        {/* Clusters — blue circle background with the count text overlaid */}
        {clusterBgImageId ? (
          <Mapbox.SymbolLayer
            id="driver-cluster-bubble"
            filter={['has', 'count']}
            style={{
              iconImage: clusterBgImageId,
              iconAnchor: 'center',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconRotationAlignment: 'viewport',
              textField: ['get', 'label'],
              textColor: '#FFFFFF',
              textSize: 13,
              textAnchor: 'center',
              textIgnorePlacement: true,
              textAllowOverlap: true,
              textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
              symbolSortKey: 3,
            }}
          />
        ) : null}
      </Mapbox.ShapeSource>
    );
  },
  (prev, next) => {
    if (prev.zoomLevel !== next.zoomLevel) return false;
    const a = prev.drivers;
    const b = next.drivers;
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].lat !== b[i].lat || a[i].lng !== b[i].lng) return false;
    }
    return true;
  }
);

DriverCluster.displayName = 'DriverCluster';

export default DriverCluster;
