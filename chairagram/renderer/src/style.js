// style.js — palette, stroke widths, fonts, number/label formatting.
//
// Every value here was extracted from the legacy measured drawings:
//   ../jimmy-possum/build-src/measured/chair_diagram.svg
//   ../jimmy-possum/build-src/measured/bench_diagram.svg
// Do not invent new values; the drawing package has ONE look.

/** Internal drawing scale: 10 px = 1 inch (legacy convention). */
export const PX_PER_IN = 10;
export const MM_PER_IN = 25.4;

/** px per spec unit, for `meta.units`. */
export function pxPerUnit(units) {
  return units === 'mm' ? PX_PER_IN / MM_PER_IN : PX_PER_IN;
}

export const FONT = {
  family: 'Helvetica,Arial,sans-serif',
  title: 19,        // legacy title  <text font-size="19" font-weight="bold">
  subtitle: 12,     // legacy subtitle
  dim: 11.5,        // legacy dimension label
  angle: 12.5,      // legacy angle label (bold)
  note: 10.5,       // legacy annotation
  smallNote: 9.5,   // legacy gray italic aside
  caption: 11,      // legacy panel caption, letter-spacing 2px
  table: 10.5,
};

export const PALETTE = {
  paper: '#ffffff',
  ink: '#111',
  subInk: '#666',
  caption: '#999',
  aside: '#9aa0a8',

  // dimension blue — legacy #33628f, used for every dim line, arrow, arc, note
  dim: '#33628f',

  // ground
  ground: '#8a8a8a',
  groundHatch: '#c6c6c6',

  // wood — near (drawn) parts
  woodFill: '#a97e52',
  woodStroke: '#6b4a26',
  // wood — far side of a mirrored pair (drawn behind, lighter)
  woodFarFill: '#c4a97e',
  woodFarStroke: '#a08154',
  // sticks (drawn as fat round-capped strokes, legacy style)
  stickStroke: '#9c7448',
  // through-tenon end grain
  tenonFill: '#8a6a3c',
  tenonFarFill: '#b08e60',
  tenonStroke: '#5a3a1a',
  // live edge — the heavy irregular top line on the bench comb
  liveEdge: '#4a2c12',

  // axonometric inset: light linework only
  axoStroke: '#8a7458',
  axoFill: '#e8dcc8',
  // round members in the axo. Fully opaque on purpose: a rod is painted as a
  // run of depth-sorted segments, and any transparency shows every seam where
  // two of them overlap.
  axoRod: '#96826a',

  // table rules
  rule: '#d4d4d4',
};

/**
 * The provenance layer (RENDERER.md, artifact provenance) — the ONLY colours
 * in this file NOT extracted from the legacy drawings. There is nothing to
 * extract: every legacy drawing was a measured drawing, so none of them ever
 * had to say it was not. These are the annotator's own banner colours
 * (app/index.html --bad / --warn and their soft fills), so a sheet on screen
 * and the same sheet exported say the same thing in the same colour.
 */
export const PROVENANCE = {
  alert: '#a13530',
  warn: '#9a5b1c',
  warnSoft: '#fbf1e3',
  watermark: '#a13530',
};

export const STROKE = {
  ground: 2.2,
  groundHatch: 1.0,
  wood: 1.4,
  tenonDash: 1.2,       // dashed leg-through-part line, legacy 1.10–1.20
  dimLine: 1.1,
  extLine: 0.7,
  arc: 1.3,
  leader: 0.7,
  axo: 1.0,
  rule: 0.8,
};

export const DASH = {
  ext: '3,3',
  tenon: '3,3',
  sight: '4,3',         // legacy layout/reference line dash
};

/** Arrowhead: legacy filled triangle, 7 px long × 2.8 px half-width. */
export const ARROW = { len: 7, half: 2.8 };

/** Ground hatch: tick every 13 px, 5.5 px down-and-left, legacy exactly. */
export const HATCH = { pitch: 13, run: 5.5 };

/** Dimension stacking: first rail this far off the geometry, then every STEP. */
export const DIM_RAIL = { base: 18, step: 18 };

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/**
 * ASCII fraction, nearest 1/16 max, reduced (1/2 not 8/16), whole numbers bare.
 * 44.5 -> "44 1/2"   18 -> "18"   17.875 -> "17 7/8"   0.5 -> "1/2"
 */
export function fraction(value, denom = 16) {
  const sign = value < 0 ? '-' : '';
  const a = Math.abs(value);
  let n = Math.round(a * denom);
  let whole = Math.floor(n / denom);
  let rem = n - whole * denom;
  if (rem === 0) return sign + String(whole);
  const g = gcd(rem, denom);
  const num = rem / g;
  const den = denom / g;
  if (whole === 0) return `${sign}${num}/${den}`;
  return `${sign}${whole} ${num}/${den}`;
}

/** Millimetre display: one decimal, trailing ".0" stripped. */
export function decimal(value) {
  const s = value.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** A length in the spec's own units, formatted the legacy way. */
export function formatLength(value, units) {
  return units === 'mm' ? decimal(value) : fraction(value, 16);
}

/**
 * Legacy dimension label: `44 1/2 — overall height`
 * (em dash, lowercase description, ASCII fraction value).
 */
export function dimLabel(value, description, units) {
  return `${formatLength(value, units)} — ${description}`;
}

/** Angle on a dimension arc: nearest 1/2 degree, legacy `13 1/2°`. */
export function formatAngle(deg) {
  return `${fraction(deg, 2)}°`;
}

/** Angle in the angle table: one decimal, per RENDERER.md. */
export function tableAngle(deg) {
  const s = deg.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

/** Unit word for the title block. */
export function unitWord(units) {
  return units === 'mm' ? 'millimetres' : 'inches';
}
