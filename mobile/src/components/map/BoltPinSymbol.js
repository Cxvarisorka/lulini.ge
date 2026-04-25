/**
 * BoltPinSymbol
 *
 * Native SymbolLayer-based pill pin (Pickup / Drop off). Replaces the JSX
 * `BoltPin` inside `PointAnnotation` / `MarkerView`, which rendered text
 * unreliably on iOS in @rnmapbox/maps 10.x.
 *
 * Pattern mirrors `DriverCluster` — one `ShapeSource` + one `SymbolLayer`
 * that overlays the pre-rendered `boltpinBg{Green,Dark}` PNG with a
 * formatted `textField` so the caption (small, faded) and title (bold)
 * keep the two-tier visual hierarchy of the original JSX BoltPin.
 */
import { memo, useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

import { pointFeature } from './mapboxGeo';
import { imageIdFor, markerImages } from './markerImages';

const BG_BY_VARIANT = {
  green: markerImages.boltpinBgGreen,
  dark: markerImages.boltpinBgDark,
};

function BoltPinSymbol({ id, coordinate, variant = 'green', caption, title, zIndex = 10 }) {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  const shape = useMemo(() => pointFeature({ latitude: lat, longitude: lng }), [lat, lng]);

  const bgImage = BG_BY_VARIANT[variant] ?? BG_BY_VARIANT.green;
  const iconImageId = imageIdFor(bgImage);

  if (!isValid || !iconImageId) return null;

  // Mapbox `format` expression lets one SymbolLayer render two distinct
  // text spans: a small faded caption on top and a bold title below.
  const textField = [
    'format',
    caption ? `${caption}\n` : '',
    { 'font-scale': 0.72, 'text-color': 'rgba(255,255,255,0.85)' },
    title ?? '',
    { 'font-scale': 1.0 },
  ];

  return (
    <Mapbox.ShapeSource id={`${id}-src`} shape={shape}>
      <Mapbox.SymbolLayer
        id={`${id}-lyr`}
        style={{
          iconImage: iconImageId,
          iconTextFit: 'both',
          iconTextFitPadding: [4, 10, 12, 10],
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
          iconRotationAlignment: 'viewport',
          iconPitchAlignment: 'viewport',
          textField,
          textColor: '#FFFFFF',
          textSize: 13,
          textAnchor: 'center',
          textJustify: 'center',
          textLineHeight: 1.15,
          textAllowOverlap: true,
          textIgnorePlacement: true,
          textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
          textOffset: [0, -0.7],
          symbolSortKey: zIndex,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

export default memo(BoltPinSymbol);
