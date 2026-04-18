/**
 * generate-marker-assets.js
 *
 * Generates PNG marker images at @1x, @2x, @3x for react-native-maps.
 * Uses @napi-rs/canvas + Ionicons font for consistent icon-library visuals.
 *
 * Run: node scripts/generate-marker-assets.js
 */
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// ── Register Ionicons font ──────────────────────────────────────────
const FONT_PATH = path.join(
  __dirname, '..', 'mobile', 'node_modules',
  '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'
);
GlobalFonts.registerFromPath(FONT_PATH, 'Ionicons');

// ── Output directories ──────────────────────────────────────────────
const MOBILE_DIR = path.join(__dirname, '..', 'mobile', 'assets', 'markers');
const DRIVER_DIR = path.join(__dirname, '..', 'mobile-driver', 'assets', 'markers');
fs.mkdirSync(MOBILE_DIR, { recursive: true });
fs.mkdirSync(DRIVER_DIR, { recursive: true });

// ── Brand Colors ─────────────────────────────────────────────────────
const BLUE_PRIMARY = '#1A73E8';     // Google blue — assigned car
const BLUE_LIGHT = '#4A90D9';      // Medium blue — regular car

// ── Ionicons glyph codes ─────────────────────────────────────────────
const ICON = {
  carSport:  String.fromCharCode(61924),  // car-sport (filled)
  flag:      String.fromCharCode(62224),  // flag (filled)
  location:  String.fromCharCode(62404),  // location (filled pin)
  navigate:  String.fromCharCode(62572),  // navigate (filled arrow)
  person:    String.fromCharCode(62629),  // person (filled)
};

// ── Helpers ──────────────────────────────────────────────────────────

function savePNG(canvas, name, dirs) {
  const buf = canvas.toBuffer('image/png');
  for (const dir of dirs) {
    fs.writeFileSync(path.join(dir, name), buf);
  }
}

/**
 * Draw a filled circle with border and optional drop shadow.
 */
function drawCircleMarker(opts) {
  const {
    size,
    bg,
    borderWidth,
    borderColor = '#ffffff',
    padding = 14,
    scale = 1,
  } = opts;

  const totalSize = (size + padding * 2) * scale;
  const canvas = createCanvas(totalSize, totalSize);
  const ctx = canvas.getContext('2d');

  const cx = totalSize / 2;
  const cy = totalSize / 2;
  const r = (size / 2) * scale;
  const bw = borderWidth * scale;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scale;

  // Border circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = borderColor;
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Inner fill
  ctx.beginPath();
  ctx.arc(cx, cy, r - bw, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  return { canvas, ctx, cx, cy, r, bw, scale };
}

/**
 * Draw an Ionicons glyph centered in the marker.
 * rotationDeg: rotate the icon (e.g., -90 for car facing north).
 */
function drawIcon(ctx, cx, cy, glyph, fontSize, color, scale, rotationDeg = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rotationDeg) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }
  ctx.fillStyle = color;
  ctx.font = `${fontSize * scale}px Ionicons`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
}

/**
 * Draw centered text (for stop numbers).
 */
function drawText(ctx, cx, cy, text, fontSize, color, scale) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize * scale}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1 * scale);
  ctx.restore();
}

// ── Marker Generators ────────────────────────────────────────────────

/**
 * Draw a top-down car silhouette facing north (up).
 * Clean, polished shape — no circle background, transparent canvas.
 */
function drawTopDownCar(ctx, cx, cy, size, color, scale) {
  const s = size * scale;
  const w = s * 0.48;  // body width
  const h = s * 0.88;  // body height
  const r = s * 0.14;  // corner radius

  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.save();

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scale;

  // ── Main body ──
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Reset shadow for inner details
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ── Windshield (front, darker) ──
  const ww = w * 0.72;
  const wh = h * 0.20;
  const wx = cx - ww / 2;
  const wy = y + h * 0.14;
  const wr = s * 0.05;

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(wx + wr, wy);
  ctx.lineTo(wx + ww - wr, wy);
  ctx.quadraticCurveTo(wx + ww, wy, wx + ww, wy + wr);
  ctx.lineTo(wx + ww, wy + wh - wr);
  ctx.quadraticCurveTo(wx + ww, wy + wh, wx + ww - wr, wy + wh);
  ctx.lineTo(wx + wr, wy + wh);
  ctx.quadraticCurveTo(wx, wy + wh, wx, wy + wh - wr);
  ctx.lineTo(wx, wy + wr);
  ctx.quadraticCurveTo(wx, wy, wx + wr, wy);
  ctx.closePath();
  ctx.fill();

  // ── Rear window ──
  const rw = w * 0.62;
  const rh = h * 0.14;
  const rx = cx - rw / 2;
  const ry = y + h * 0.62;

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(rx + wr, ry);
  ctx.lineTo(rx + rw - wr, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + wr);
  ctx.lineTo(rx + rw, ry + rh - wr);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - wr, ry + rh);
  ctx.lineTo(rx + wr, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - wr);
  ctx.lineTo(rx, ry + wr);
  ctx.quadraticCurveTo(rx, ry, rx + wr, ry);
  ctx.closePath();
  ctx.fill();

  // ── Headlights (two small dots at front) ──
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const hlR = s * 0.04;
  ctx.beginPath();
  ctx.arc(x + w * 0.22, y + h * 0.06, hlR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.78, y + h * 0.06, hlR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function generateCarMarker(name, size, color, dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const padding = 10;
    const totalSize = (size + padding * 2) * scale;
    const canvas = createCanvas(totalSize, totalSize);
    const ctx = canvas.getContext('2d');
    const cx = totalSize / 2;
    const cy = totalSize / 2;

    drawTopDownCar(ctx, cx, cy, size, color, scale);
    savePNG(canvas, `${name}${suffix}.png`, dirs);
  }
}

/**
 * Draw a map pin shape: circle head with pointed tail at bottom.
 * The tip of the tail sits at the very bottom of the canvas.
 * Use anchor { x: 0.5, y: 1 } so the tip points to the coordinate.
 */
function drawPinMarker(opts) {
  const {
    headSize,       // circle diameter
    bg,
    borderWidth,
    borderColor = '#ffffff',
    tailHeight = 10,
    padding = 8,
    scale = 1,
  } = opts;

  const w = (headSize + padding * 2) * scale;
  const h = (headSize + tailHeight + padding * 2) * scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const cx = w / 2;
  const headCy = (padding + headSize / 2) * scale;
  const r = (headSize / 2) * scale;
  const bw = borderWidth * scale;
  const th = tailHeight * scale;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 3 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scale;

  // Draw pin shape: circle + triangle tail as one path
  ctx.fillStyle = borderColor;
  ctx.beginPath();
  ctx.arc(cx, headCy, r, 0, Math.PI * 2);
  ctx.fill();

  // Tail (triangle pointing down) — border
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, headCy + r * 0.75);
  ctx.lineTo(cx, headCy + r + th);
  ctx.lineTo(cx + r * 0.45, headCy + r * 0.75);
  ctx.closePath();
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, headCy, r - bw, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  // Inner tail
  ctx.beginPath();
  ctx.moveTo(cx - (r - bw) * 0.4, headCy + (r - bw) * 0.7);
  ctx.lineTo(cx, headCy + r + th - bw * 1.5);
  ctx.lineTo(cx + (r - bw) * 0.4, headCy + (r - bw) * 0.7);
  ctx.closePath();
  ctx.fill();

  return { canvas, ctx, cx, cy: headCy, r, bw, scale };
}

function generateDestinationMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawPinMarker({
      headSize: 28, bg: '#ef4444', borderWidth: 2.5, tailHeight: 10, padding: 8, scale,
    });
    drawIcon(ctx, cx, cy, ICON.flag, 16, '#ffffff', scale);
    savePNG(canvas, `marker-destination${suffix}.png`, dirs);
  }
}

function generatePickupMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawPinMarker({
      headSize: 28, bg: '#4285F4', borderWidth: 2.5, tailHeight: 10, padding: 8, scale,
    });
    drawIcon(ctx, cx, cy, ICON.location, 15, '#ffffff', scale);
    savePNG(canvas, `marker-pickup${suffix}.png`, dirs);
  }
}

function generateDropoffMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawPinMarker({
      headSize: 24, bg: '#ef4444', borderWidth: 2.5, tailHeight: 8, padding: 6, scale,
    });
    drawIcon(ctx, cx, cy, ICON.flag, 13, '#ffffff', scale);
    savePNG(canvas, `marker-dropoff${suffix}.png`, dirs);
  }
}

function generateUserMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    // Simple blue dot with white border — no icon
    const { canvas } = drawCircleMarker({
      size: 18, bg: '#4285F4', borderWidth: 3, padding: 10, scale,
    });
    savePNG(canvas, `marker-user${suffix}.png`, dirs);
  }
}

/**
 * Cluster bubble background — solid blue circle with white border.
 * Used by Mapbox SymbolLayer with `iconTextFit: 'both'` so the dynamic
 * driver-count text overlays the centre. The PNG already includes a
 * white halo so it reads against any map style.
 */
function generateClusterBg(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas } = drawCircleMarker({
      size: 36, bg: '#1A73E8', borderWidth: 2.5, padding: 8, scale,
    });
    savePNG(canvas, `marker-cluster-bg${suffix}.png`, dirs);
  }
}

/**
 * BoltPin pill background — rounded rectangle with a small triangular
 * tail and white-bordered dot beneath. Mapbox SymbolLayer renders the
 * dynamic ETA/title text on top via `iconTextFit: 'both'`.
 *
 * Two colour variants:
 *   - dark  (#111827) → dropoff / destination bubble
 *   - green (#10B981) → pickup bubble
 *
 * Anchor is `bottom`: the dot sits at the geographic coordinate.
 */
function drawBoltPinBg(opts) {
  const { color, scale } = opts;
  // Pill geometry — needs to be wide enough that text-fit padding still
  // keeps a pleasing minimum width when the label is short ("12 min").
  const pillW = 70;
  const pillH = 26;
  const stemH = 10;
  const dotR = 7;
  const padding = 6;

  const w = (pillW + padding * 2) * scale;
  const h = (pillH + stemH + dotR * 2 + padding * 2) * scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const cx = w / 2;
  const pillX = (w - pillW * scale) / 2;
  const pillY = padding * scale;
  const r = (pillH / 2) * scale;

  // Pill drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scale;

  // White outer border
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, pillX - 2 * scale, pillY - 2 * scale, pillW * scale + 4 * scale, pillH * scale + 4 * scale, r + 2 * scale);
  ctx.fill();

  // Reset shadow before colored fill (avoid double-shadow look)
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Coloured pill
  ctx.fillStyle = color;
  roundedRect(ctx, pillX, pillY, pillW * scale, pillH * scale, r);
  ctx.fill();

  // Stem (small vertical line)
  const stemX = cx - 1 * scale;
  const stemY1 = pillY + pillH * scale;
  ctx.fillRect(stemX, stemY1, 2 * scale, stemH * scale);

  // Dot — white outer, coloured inner
  const dotCy = stemY1 + stemH * scale + dotR * scale;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, dotCy, dotR * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, dotCy, (dotR - 2) * scale, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function generateBoltPinBg(name, color, dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const canvas = drawBoltPinBg({ color, scale });
    savePNG(canvas, `${name}${suffix}.png`, dirs);
  }
}

function generateStopMarker(name, size, fontSize, padding, dirs) {
  for (let num = 1; num <= 9; num++) {
    for (const scale of [1, 2, 3]) {
      const suffix = scale === 1 ? '' : `@${scale}x`;
      const { canvas, ctx, cx, cy } = drawCircleMarker({
        size, bg: '#f97316', borderWidth: 3, padding, scale,
      });
      drawText(ctx, cx, cy, String(num), fontSize, '#ffffff', scale);
      savePNG(canvas, `${name}-${num}${suffix}.png`, dirs);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const both = [MOBILE_DIR, DRIVER_DIR];
  const mobileOnly = [MOBILE_DIR];

  console.log('Generating marker assets (Ionicons + purple theme)...\n');

  // Car markers — top-down purple car silhouette (no circle)
  console.log(`  marker-car-assigned (38px, ${BLUE_PRIMARY})`);
  generateCarMarker('marker-car-assigned', 38, BLUE_PRIMARY, both);

  console.log(`  marker-car (30px, ${BLUE_LIGHT})`);
  generateCarMarker('marker-car', 30, BLUE_LIGHT, both);

  // Destination — red with Ionicons flag
  console.log('  marker-destination (38px, #ef4444)');
  generateDestinationMarker(both);

  // Pickup — blue pin with Ionicons location
  console.log('  marker-pickup (28px, #4285F4)');
  generatePickupMarker(both);

  // Dropoff — red with Ionicons flag
  console.log('  marker-dropoff (26px, #ef4444)');
  generateDropoffMarker(both);

  // User location — blue with Ionicons navigate
  console.log('  marker-user (22px, #4285F4)');
  generateUserMarker(mobileOnly);

  // Stop markers — orange with number text
  console.log('  marker-stop-1..9 (32px, #f97316)');
  generateStopMarker('marker-stop', 32, 13, 12, both);

  console.log('  marker-stop-small-1..9 (26px, #f97316)');
  generateStopMarker('marker-stop-small', 26, 12, 10, both);

  // Cluster bubble background — driver count text overlays via Mapbox iconTextFit
  console.log(`  marker-cluster-bg (36px, ${BLUE_PRIMARY})`);
  generateClusterBg(both);

  // BoltPin pill backgrounds — dynamic ETA / pickup text overlays via Mapbox iconTextFit
  console.log('  marker-boltpin-bg-dark (#111827)');
  generateBoltPinBg('marker-boltpin-bg-dark', '#111827', both);
  console.log('  marker-boltpin-bg-green (#10B981)');
  generateBoltPinBg('marker-boltpin-bg-green', '#10B981', both);

  const mobileFiles = fs.readdirSync(MOBILE_DIR).filter(f => f.endsWith('.png'));
  const driverFiles = fs.readdirSync(DRIVER_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nDone! Generated ${mobileFiles.length} PNGs in mobile/assets/markers/`);
  console.log(`       Generated ${driverFiles.length} PNGs in mobile-driver/assets/markers/`);
}

main();
