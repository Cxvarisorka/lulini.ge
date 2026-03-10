/**
 * Minimalist low-saturation Google Maps style.
 *
 * Design decisions:
 * - Low saturation base — subtle color hints so the map feels alive
 * - Water has a soft blue tint, parks/nature have faint green
 * - POI businesses visible as muted gray labels/icons for context
 * - Custom markers remain the most colorful elements on the map
 */
export const mapStyle = [
  // ── Hide noisy POIs but keep businesses ────────────────
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },

  // ── POI businesses — gray icons & labels ────────────────
  { featureType: 'poi.business', elementType: 'geometry', stylers: [{ color: '#ebebeb' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'poi.business', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { featureType: 'poi.business', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 35 }] },

  // ── POI medical/school — gray ──────────────────────────
  { featureType: 'poi.medical', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 35 }] },
  { featureType: 'poi.school', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'poi.school', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 35 }] },

  // ── Landscape — neutral light gray ─────────────────────
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#efefef' }] },
  { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#e9eae6' }] },

  // ── Parks — very faint green ───────────────────────────
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#dce5d6' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9ea898' }] },
  { featureType: 'poi.park', elementType: 'labels.icon', stylers: [{ saturation: -80 }, { lightness: 25 }] },

  // ── Water — soft muted blue ────────────────────────────
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c4d4e0' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // ── Roads — white with light gray strokes ──────────────
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#e3e3e1' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#d8d8d6' }] },

  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#f0ede6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d4d1ca' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#ebe7df' }] },

  // ── Road labels — muted gray ───────────────────────────
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // ── Administrative — subtle gray ───────────────────────
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 4 }] },
];

// Route polyline style — dark with rounded caps, Uber-like
export const ROUTE_STYLE = {
  strokeColor: '#1a1a2e',
  strokeWidth: 5,
  lineCap: 'round',
  lineJoin: 'round',
};

// Route shadow polyline — rendered behind main route for depth
export const ROUTE_SHADOW_STYLE = {
  strokeColor: '#00000020',
  strokeWidth: 8,
  lineCap: 'round',
  lineJoin: 'round',
};

// Driver-to-pickup route style — slightly thinner
export const DRIVER_ROUTE_STYLE = {
  strokeColor: '#1a1a2e',
  strokeWidth: 4,
  lineCap: 'round',
  lineJoin: 'round',
  lineDashPattern: [0],
};

// ══════════════════════════════════════════════════════════════
// DARK MODE — Uber/Bolt night style for low-light conditions
// Usage: <MapView customMapStyle={isDark ? mapStyleDark : mapStyle} />
// Note: Only affects Android (PROVIDER_GOOGLE). iOS Apple Maps
// follows system dark mode automatically.
// ══════════════════════════════════════════════════════════════

export const mapStyleDark = [
  // ── Hide distractions ──────────────────────────────────
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },

  // ── Base geometry ──────────────────────────────────────
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },

  // ── Landscape ──────────────────────────────────────────
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#2a2e35' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#262a30' }] },
  { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#2a2e35' }] },

  // ── Water ──────────────────────────────────────────────
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // ── Roads ──────────────────────────────────────────────
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#8a7a5c' }] },

  // ── Administrative ────────────────────────────────────
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#394555' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
];

// Dark mode route styles — brighter colors for visibility on dark map
export const ROUTE_STYLE_DARK = {
  strokeColor: '#6c9cff',
  strokeWidth: 5,
  lineCap: 'round',
  lineJoin: 'round',
};

export const ROUTE_SHADOW_STYLE_DARK = {
  strokeColor: '#3366cc40',
  strokeWidth: 8,
  lineCap: 'round',
  lineJoin: 'round',
};

export const DRIVER_ROUTE_STYLE_DARK = {
  strokeColor: '#6c9cff',
  strokeWidth: 4,
  lineCap: 'round',
  lineJoin: 'round',
  lineDashPattern: [0],
};
