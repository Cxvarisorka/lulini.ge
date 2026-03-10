/**
 * Minimalist low-saturation Google Maps style.
 * Mostly colorless with faint hints — custom markers stand out.
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
