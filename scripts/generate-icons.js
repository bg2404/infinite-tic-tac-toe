/**
 * Generates every app icon asset from the design tokens in src/theme/themes.ts.
 *
 *   node scripts/generate-icons.js
 *
 * The artwork ("Quad Board") is a 2x2 of the same floating cells the board
 * uses: cyan X and pink O on the diagonal, matching the running UI exactly.
 * Everything is drawn as vector and rasterised once, so proportions can be
 * tuned here rather than by editing binaries.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --- Tokens (kept in sync with src/theme/themes.ts) ------------------------
const BG = '#121826'; // dark canvas
const CELL = '#1F2937'; // inactive cell / panel
const X_COLOR = '#06B6D4'; // cyan X
const O_COLOR = '#EC4899'; // pink O

// --- Artwork geometry, authored in a 1024 square ---------------------------
const BASE = 1024;
const CELL_SIZE = 384;
const GAP = 52;
const RADIUS_RATIO = 0.16; // matches RADIUS.cell (16) against a ~100pt cell
const MARK_RATIO = 0.5;
const STROKE_RATIO = 0.105;

const ORIGIN = (BASE - (2 * CELL_SIZE + GAP)) / 2; // 102
const POS = [ORIGIN, ORIGIN + CELL_SIZE + GAP];

/**
 * Android adaptive layers are masked by the launcher, and the mask can be a
 * full circle — so the guaranteed-visible region is a *circle* of 72/108 of
 * the canvas, not a square. Artwork is therefore inscribed by radius below.
 */
const ANDROID_SAFE_DIAMETER = 72 / 108;

/**
 * Distance from the artwork's centre to its outermost point: the bulge of an
 * outer cell's rounded corner. Fitting by this (rather than by the bounding
 * square's width) is what keeps the corners and the X's tip inside a circular
 * mask.
 */
const CORNER_R = CELL_SIZE * RADIUS_RATIO;
const ART_RADIUS =
  Math.hypot(BASE / 2 - (ORIGIN + CORNER_R), BASE / 2 - (ORIGIN + CORNER_R)) + CORNER_R;

const cellRects = (fill) =>
  POS.flatMap((y) => POS.map((x) => ({ x, y })))
    .map(
      ({ x, y }) =>
        `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${(
          CELL_SIZE * RADIUS_RATIO
        ).toFixed(1)}" ry="${(CELL_SIZE * RADIUS_RATIO).toFixed(1)}" fill="${fill}"/>`
    )
    .join('');

const xMark = (color) => {
  const cx = POS[0] + CELL_SIZE / 2;
  const h = (CELL_SIZE * MARK_RATIO) / 2;
  const sw = CELL_SIZE * STROKE_RATIO;
  return (
    `<g stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round">` +
    `<line x1="${cx - h}" y1="${cx - h}" x2="${cx + h}" y2="${cx + h}"/>` +
    `<line x1="${cx - h}" y1="${cx + h}" x2="${cx + h}" y2="${cx - h}"/>` +
    `</g>`
  );
};

const oMark = (color) => {
  const c = POS[1] + CELL_SIZE / 2;
  const sw = CELL_SIZE * STROKE_RATIO;
  // An open ring reads optically smaller than a cross of equal width, so the
  // radius gets a small nudge to sit level with the X.
  const r = ((CELL_SIZE * MARK_RATIO) / 2) * 1.04;
  return `<circle cx="${c}" cy="${c}" r="${r.toFixed(
    1
  )}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(1)}"/>`;
};

/** The artwork minus its background, optionally scaled into a smaller canvas. */
const artwork = () => cellRects(CELL) + xMark(X_COLOR) + oMark(O_COLOR);

/**
 * Fits the 1024-space artwork inside a centred circle of `diameterFraction`
 * of `size`, measuring by the artwork's bounding radius so nothing pokes out
 * of a circular launcher mask.
 */
const fitInCircle = (size, diameterFraction) => {
  const scale = ((size * diameterFraction) / 2) / ART_RADIUS;
  const offset = size / 2 - (BASE / 2) * scale;
  return `translate(${offset.toFixed(2)}, ${offset.toFixed(2)}) scale(${scale.toFixed(5)})`;
};

const svgDoc = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

// --- Assets ----------------------------------------------------------------

/** iOS/base icon: full-bleed background, artwork at its authored size. */
const fullIcon = () => svgDoc(BASE, `<rect width="${BASE}" height="${BASE}" fill="${BG}"/>${artwork()}`);

/** Android adaptive foreground: transparent, artwork inside the safe zone. */
const androidForeground = (size) =>
  svgDoc(size, `<g transform="${fitInCircle(size, ANDROID_SAFE_DIAMETER)}">${artwork()}</g>`);

/** Android adaptive background: the canvas colour, edge to edge. */
const androidBackground = (size) => svgDoc(size, `<rect width="${size}" height="${size}" fill="${BG}"/>`);

/**
 * Android themed-icon layer: a single-colour silhouette. The cells are solid
 * and the marks are punched out of them, so the shape still reads as the game
 * once the launcher tints it.
 */
const androidMonochrome = (size) => {
  const mask =
    `<mask id="cut">` +
    `<rect width="${BASE}" height="${BASE}" fill="black"/>` +
    cellRects('white') +
    xMark('black') +
    oMark('black') +
    `</mask>`;
  return svgDoc(
    size,
    `<defs>${mask}</defs>` +
      `<g transform="${fitInCircle(size, ANDROID_SAFE_DIAMETER)}">` +
      `<rect width="${BASE}" height="${BASE}" fill="white" mask="url(#cut)"/>` +
      `</g>`
  );
};

const assets = path.join(__dirname, '..', 'assets');

async function main() {
  const write = async (file, svg, { flatten = false, size } = {}) => {
    let img = sharp(Buffer.from(svg));
    if (size) img = img.resize(size, size);
    // iOS rejects an app icon containing an alpha channel, so the base icon is
    // composited onto the canvas colour and its alpha dropped.
    if (flatten) img = img.flatten({ background: BG }).removeAlpha();
    await img.png().toFile(path.join(assets, file));
    const meta = await sharp(path.join(assets, file)).metadata();
    console.log(
      `  ${file.padEnd(30)} ${String(meta.width).padStart(4)}x${meta.height}  alpha=${meta.hasAlpha}`
    );
  };

  console.log('Generating icons from theme tokens:');
  await write('icon.png', fullIcon(), { flatten: true });
  await write('favicon.png', fullIcon(), { size: 48 });
  await write('android-icon-background.png', androidBackground(512));
  await write('android-icon-foreground.png', androidForeground(512));
  await write('android-icon-monochrome.png', androidMonochrome(432));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
