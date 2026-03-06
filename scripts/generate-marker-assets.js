/**
 * generate-marker-assets.js
 *
 * Generates PNG marker images at @1x, @2x, @3x for react-native-maps.
 * Uses @napi-rs/canvas (pure Rust, no native deps, works on Windows).
 *
 * Run: node scripts/generate-marker-assets.js
 */
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// Output directories
const MOBILE_DIR = path.join(__dirname, '..', 'mobile', 'assets', 'markers');
const DRIVER_DIR = path.join(__dirname, '..', 'mobile-driver', 'assets', 'markers');

fs.mkdirSync(MOBILE_DIR, { recursive: true });
fs.mkdirSync(DRIVER_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────

function savePNG(canvas, name, dirs) {
  const buf = canvas.toBuffer('image/png');
  for (const dir of dirs) {
    fs.writeFileSync(path.join(dir, name), buf);
  }
}

/**
 * Draw a filled circle with border.
 * Returns the canvas for further drawing (icon/text).
 */
function drawCircleMarker(opts) {
  const {
    size,           // logical circle diameter (px)
    bg,             // fill color
    borderWidth,    // border width
    borderColor = '#ffffff',
    padding = 14,   // padding around circle to prevent clipping
    scale = 1,
  } = opts;

  const totalSize = (size + padding * 2) * scale;
  const canvas = createCanvas(totalSize, totalSize);
  const ctx = canvas.getContext('2d');

  const cx = totalSize / 2;
  const cy = totalSize / 2;
  const r = (size / 2) * scale;
  const bw = borderWidth * scale;

  // Drop shadow (subtle, like iOS shadow)
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

  // Inner fill circle
  ctx.beginPath();
  ctx.arc(cx, cy, r - bw, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  return { canvas, ctx, cx, cy, r, bw, scale };
}

/**
 * Draw a simple car silhouette facing up (north).
 * Draws a top-down car shape: body, windshield, rear window.
 */
function drawCarIcon(ctx, cx, cy, iconSize, color, scale) {
  const s = iconSize * scale;
  const x = cx;
  const y = cy;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Car body (rounded rectangle, slightly wider at bottom)
  const bw = s * 0.55; // body width
  const bh = s * 0.85; // body height
  const br = s * 0.15; // corner radius

  // Draw rounded rect body
  const bx = x - bw / 2;
  const by = y - bh / 2;
  ctx.beginPath();
  ctx.moveTo(bx + br, by);
  ctx.lineTo(bx + bw - br, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
  ctx.lineTo(bx + bw, by + bh - br);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
  ctx.lineTo(bx + br, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
  ctx.lineTo(bx, by + br);
  ctx.quadraticCurveTo(bx, by, bx + br, by);
  ctx.closePath();
  ctx.fill();

  // Windshield (top window area)
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  const ww = bw * 0.7;
  const wh = bh * 0.18;
  const wx = x - ww / 2;
  const wy = y - bh * 0.2;
  const wr = s * 0.06;
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

  // Rear window
  const rwy = y + bh * 0.12;
  const rwh = bh * 0.14;
  ctx.beginPath();
  ctx.moveTo(wx + wr, rwy);
  ctx.lineTo(wx + ww - wr, rwy);
  ctx.quadraticCurveTo(wx + ww, rwy, wx + ww, rwy + wr);
  ctx.lineTo(wx + ww, rwy + rwh - wr);
  ctx.quadraticCurveTo(wx + ww, rwy + rwh, wx + ww - wr, rwy + rwh);
  ctx.lineTo(wx + wr, rwy + rwh);
  ctx.quadraticCurveTo(wx, rwy + rwh, wx, rwy + rwh - wr);
  ctx.lineTo(wx, rwy + wr);
  ctx.quadraticCurveTo(wx, rwy, wx + wr, rwy);
  ctx.closePath();
  ctx.fill();

  // Headlights (small circles at front)
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const hlR = s * 0.06;
  ctx.beginPath();
  ctx.arc(x - bw * 0.32, by + bh * 0.05 + hlR, hlR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + bw * 0.32, by + bh * 0.05 + hlR, hlR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a flag icon.
 */
function drawFlagIcon(ctx, cx, cy, iconSize, color, scale) {
  const s = iconSize * scale;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5 * scale;
  ctx.lineCap = 'round';

  // Flag pole
  const poleX = cx - s * 0.2;
  const poleTop = cy - s * 0.4;
  const poleBottom = cy + s * 0.4;
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX, poleBottom);
  ctx.stroke();

  // Flag (triangle/pennant)
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX + s * 0.5, poleTop + s * 0.2);
  ctx.lineTo(poleX, poleTop + s * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw centered text.
 */
function drawText(ctx, cx, cy, text, fontSize, color, scale) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize * scale}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1 * scale); // +1 for visual centering
  ctx.restore();
}

// ── Marker Generators ────────────────────────────────────────────────

function generateCarMarker(name, size, bg, borderWidth, iconSize, dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawCircleMarker({
      size, bg, borderWidth, padding: 14, scale,
    });
    drawCarIcon(ctx, cx, cy, iconSize, '#ffffff', scale);
    savePNG(canvas, `${name}${suffix}.png`, dirs);
  }
}

function generateDestinationMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawCircleMarker({
      size: 38, bg: '#ef4444', borderWidth: 3, padding: 14, scale,
    });
    drawFlagIcon(ctx, cx, cy, 18, '#ffffff', scale);
    savePNG(canvas, `marker-destination${suffix}.png`, dirs);
  }
}

function generatePickupMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const outerSize = 24;
    const padding = 10;
    const { canvas, ctx, cx, cy } = drawCircleMarker({
      size: outerSize, bg: '#22c55e', borderWidth: 2, padding, scale,
    });
    // Inner dot
    const dotR = 5 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    savePNG(canvas, `marker-pickup${suffix}.png`, dirs);
  }
}

function generateDropoffMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas, ctx, cx, cy } = drawCircleMarker({
      size: 26, bg: '#ef4444', borderWidth: 2.5, padding: 12, scale,
    });
    drawFlagIcon(ctx, cx, cy, 14, '#ffffff', scale);
    savePNG(canvas, `marker-dropoff${suffix}.png`, dirs);
  }
}

function generateUserMarker(dirs) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const { canvas } = drawCircleMarker({
      size: 22, bg: '#4285F4', borderWidth: 3, padding: 10, scale,
    });
    savePNG(canvas, `marker-user${suffix}.png`, dirs);
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

  console.log('Generating marker assets...\n');

  // Car markers (both apps share same assets)
  console.log('  marker-car-assigned (38px, #171717)');
  generateCarMarker('marker-car-assigned', 38, '#171717', 3, 20, both);

  console.log('  marker-car (30px, #374151)');
  generateCarMarker('marker-car', 30, '#374151', 2.5, 15, both);

  // Destination (both apps)
  console.log('  marker-destination (38px, #ef4444)');
  generateDestinationMarker(both);

  // Pickup (both apps)
  console.log('  marker-pickup (24px, #22c55e)');
  generatePickupMarker(both);

  // Dropoff (both apps)
  console.log('  marker-dropoff (26px, #ef4444)');
  generateDropoffMarker(both);

  // User location (mobile only)
  console.log('  marker-user (22px, #4285F4)');
  generateUserMarker(mobileOnly);

  // Stop markers — large (TaxiScreen, anchor bottom-center)
  console.log('  marker-stop-1..9 (32px, #f97316)');
  generateStopMarker('marker-stop', 32, 13, 12, both);

  // Stop markers — small (RideDetailScreen, anchor center)
  console.log('  marker-stop-small-1..9 (26px, #f97316)');
  generateStopMarker('marker-stop-small', 26, 12, 10, both);

  // Count generated files
  const mobileFiles = fs.readdirSync(MOBILE_DIR).filter(f => f.endsWith('.png'));
  const driverFiles = fs.readdirSync(DRIVER_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nDone! Generated ${mobileFiles.length} PNGs in mobile/assets/markers/`);
  console.log(`       Generated ${driverFiles.length} PNGs in mobile-driver/assets/markers/`);
}

main();
