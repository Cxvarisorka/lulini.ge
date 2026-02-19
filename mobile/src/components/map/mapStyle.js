/**
 * Uber/Bolt-inspired minimalist Google Maps style.
 *
 * Design decisions:
 * - All POIs and transit hidden to reduce visual noise
 * - Neutral gray landscape so markers pop
 * - Roads white with subtle strokes for clear navigation
 * - Highways warm-tinted for hierarchy without distraction
 * - Water soft blue, labels hidden
 * - Minimal administrative labels
 */
export const mapStyle = [
  // ── Hide distractions ──────────────────────────────────
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },

  // ── Landscape ──────────────────────────────────────────
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f2f3f5' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#edeef0' }] },
  { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#e8eaed' }] },

  // ── Water ──────────────────────────────────────────────
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c5d8e8' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // ── Roads — local ─────────────────────────────────────
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#e4e5e7' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  // ── Roads — arterial ──────────────────────────────────
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#d6d8db' }] },

  // ── Roads — highway ───────────────────────────────────
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#f5e8ca' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e6d5a8' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#f0ddb8' }] },

  // ── Road labels ───────────────────────────────────────
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8c8e91' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // ── Administrative ────────────────────────────────────
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#dadce0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#5f6368' }] },
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
