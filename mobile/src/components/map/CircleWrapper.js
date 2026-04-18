/**
 * CircleWrapper
 *
 * Drop-in replacement for `react-native-maps` `<Circle>` (used by TaxiScreen
 * for the 40 m pickup/dropoff zone hints).
 *
 * Mapbox's native `CircleLayer` only draws pixel-radius circles — it cannot
 * render a true metric radius that scales with zoom. We synthesise a 64-side
 * GeoJSON polygon at the requested radius (in metres) and render it via a
 * `FillLayer` + `LineLayer`. Cheap, accurate at city scale, and avoids
 * pulling in turf.js.
 *
 * External API matches react-native-maps:
 *   <Circle center={{latitude, longitude}} radius={40}
 *           strokeColor strokeWidth fillColor zIndex />
 */
import { memo, useId, useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

const EARTH_R_M = 6378137;
const SEGMENTS = 64;

function circlePolygon(centerLat, centerLng, radiusMeters) {
  const coords = [];
  // Latitude is roughly constant across the polygon at city scale.
  const latRad = centerLat * (Math.PI / 180);
  const dLat = (radiusMeters / EARTH_R_M) * (180 / Math.PI);
  const dLng = (radiusMeters / (EARTH_R_M * Math.cos(latRad))) * (180 / Math.PI);
  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * 2 * Math.PI;
    const x = centerLng + dLng * Math.cos(theta);
    const y = centerLat + dLat * Math.sin(theta);
    coords.push([x, y]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

function CircleWrapper({
  center,
  radius,
  fillColor = 'rgba(0,0,0,0)',
  strokeColor = '#000000',
  strokeWidth = 1,
  /* eslint-disable no-unused-vars */
  zIndex,
  /* eslint-enable no-unused-vars */
}) {
  const reactId = useId();
  const sourceId = useMemo(() => `circle-src-${reactId}`, [reactId]);
  const fillId = useMemo(() => `circle-fill-${reactId}`, [reactId]);
  const lineId = useMemo(() => `circle-line-${reactId}`, [reactId]);

  const lat = center?.latitude;
  const lng = center?.longitude;
  const isValid = isFinite(lat) && isFinite(lng) && isFinite(radius) && radius > 0;

  const shape = useMemo(() => {
    if (!isValid) return null;
    return circlePolygon(lat, lng, radius);
  }, [lat, lng, radius, isValid]);

  if (!shape) return null;

  return (
    <Mapbox.ShapeSource id={sourceId} shape={shape}>
      <Mapbox.FillLayer id={fillId} style={{ fillColor }} />
      <Mapbox.LineLayer
        id={lineId}
        style={{
          lineColor: strokeColor,
          lineWidth: strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </Mapbox.ShapeSource>
  );
}

export default memo(CircleWrapper);
