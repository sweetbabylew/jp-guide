// dims.js — dimension primitives, in panel pixel space.
//
// Shapes and offsets are lifted from the legacy drawings: 0.70 dashed
// extension lines, 1.10 dimension lines, filled 7 x 2.8 arrowheads, 11.5 pt
// weight-600 labels in the dimension blue, angle arcs at r = 70.
//
// `Canvas` collects elements and tracks a bounding box so a panel can size
// itself; `Rail` is the "simple stacking" RENDERER.md asks for — successive
// dimensions on the same side step outward by a fixed amount and therefore
// never land on each other or on the geometry.

import {
  PALETTE, STROKE, DASH, ARROW, FONT, DIM_RAIL,
} from './style.js';
import {
  line, polygon, path, text, textWidth, num,
} from './svg.js';

export class Canvas {
  constructor() {
    this.items = [];
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
  }

  /** Add rendered SVG plus the points it occupies. */
  add(svg, pts = []) {
    if (svg) this.items.push(svg);
    for (const p of pts) this.point(p.x, p.y);
    return this;
  }

  point(x, y) {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
    return this;
  }

  box(x, y, w, h) {
    this.point(x, y);
    this.point(x + w, y + h);
    return this;
  }

  get empty() { return this.minX === Infinity; }
  get width() { return this.empty ? 0 : this.maxX - this.minX; }
  get height() { return this.empty ? 0 : this.maxY - this.minY; }

  render() { return this.items.join('\n'); }
}

/** Successive parallel dimension rails, stepping away from the geometry. */
export class Rail {
  constructor(start, dir, step = DIM_RAIL.step) {
    this.cur = start;
    this.dir = dir >= 0 ? 1 : -1;
    this.step = step;
  }

  next() {
    const v = this.cur;
    this.cur += this.step * this.dir;
    return v;
  }
}

// ---------------------------------------------------------------------------
// low-level pieces
// ---------------------------------------------------------------------------

const dimStroke = { stroke: PALETTE.dim, 'stroke-width': STROKE.dimLine.toFixed(2), 'stroke-linecap': 'butt' };
const extStroke = { stroke: PALETTE.dim, 'stroke-width': STROKE.extLine.toFixed(2), 'stroke-linecap': 'butt', 'stroke-dasharray': DASH.ext };

/**
 * Filled triangular arrowhead at `tip`, pointing along unit vector `dir`.
 * `flip` puts the head outside the dimension (the drafting convention when the
 * span is too short for two heads to fit).
 */
export function arrowHead(canvas, tip, dir, flip = false) {
  const d = flip ? { x: -dir.x, y: -dir.y } : dir;
  const bx = tip.x - d.x * ARROW.len;
  const by = tip.y - d.y * ARROW.len;
  const px = -d.y * ARROW.half;
  const py = d.x * ARROW.half;
  const pts = [
    { x: tip.x, y: tip.y },
    { x: bx + px, y: by + py },
    { x: bx - px, y: by - py },
  ];
  canvas.add(polygon(pts, { fill: PALETTE.dim }), pts);
}

export function extensionLine(canvas, from, to) {
  canvas.add(line(from.x, from.y, to.x, to.y, extStroke), [from, to]);
}

function dimText(canvas, x, y, label, opts = {}) {
  const size = opts.size || FONT.dim;
  const anchor = opts.anchor || 'middle';
  const rotate = opts.rotate || 0;
  canvas.add(
    text(x, y, label, {
      size,
      fill: PALETTE.dim,
      anchor,
      weight: opts.weight || '600',
      rotate,
      ...(opts.extra || {}),
    }),
  );
  // bbox: approximate, generous enough for panel padding
  const w = textWidth(label, size);
  if (rotate) {
    const r = Math.max(w, size) / 2 + 2;
    canvas.box(x - r, y - r, 2 * r, 2 * r);
  } else {
    const dx = anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0;
    canvas.box(x - dx, y - size, w, size * 1.35);
  }
}

// ---------------------------------------------------------------------------
// dimensions
// ---------------------------------------------------------------------------

/**
 * Vertical dimension on rail `x`, between screen ys `y1` and `y2`.
 * `from1` / `from2` are optional geometry points to run extension lines from.
 * `side` is +1 when the rail is to the RIGHT of the geometry.
 */
export function verticalDim(canvas, { x, y1, y2, label, from1, from2, side = -1 }) {
  if (from1) extensionLine(canvas, from1, { x, y: from1.y });
  if (from2) extensionLine(canvas, from2, { x, y: from2.y });
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const tight = bot - top < ARROW.len * 3;
  const a = tight ? top - ARROW.len : top;
  const b = tight ? bot + ARROW.len : bot;
  canvas.add(line(x, a, x, b, dimStroke), [{ x, y: a }, { x, y: b }]);
  arrowHead(canvas, { x, y: top }, { x: 0, y: -1 }, tight);
  arrowHead(canvas, { x, y: bot }, { x: 0, y: 1 }, tight);
  // legacy text offsets: 4 px inboard of a left rail, 13 px outboard of a right one
  const tx = side >= 0 ? x + 13 : x - 4;
  dimText(canvas, tx, (top + bot) / 2, label, { rotate: -90 });
  return { x, top, bot };
}

/**
 * Horizontal dimension on rail `y`, between screen xs `x1` and `x2`.
 * `side` is +1 when the rail is BELOW the geometry (text goes below too).
 */
export function horizontalDim(canvas, { y, x1, x2, label, from1, from2, side = 1 }) {
  if (from1) extensionLine(canvas, from1, { x: from1.x, y });
  if (from2) extensionLine(canvas, from2, { x: from2.x, y });
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const tight = right - left < ARROW.len * 3;
  const a = tight ? left - ARROW.len : left;
  const b = tight ? right + ARROW.len : right;
  canvas.add(line(a, y, b, y, dimStroke), [{ x: a, y }, { x: b, y }]);
  arrowHead(canvas, { x: left, y }, { x: -1, y: 0 }, tight);
  arrowHead(canvas, { x: right, y }, { x: 1, y: 0 }, tight);
  const ty = side >= 0 ? y + 15 : y - 6;
  dimText(canvas, (left + right) / 2, ty, label);
  return { y, left, right };
}

/**
 * Dimension parallel to an arbitrary line a->b, offset perpendicular by
 * `offset` px (sign picks the side). Used for along-the-stick lengths.
 */
export function alignedDim(canvas, { a, b, offset, label }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const a2 = { x: a.x + nx * offset, y: a.y + ny * offset };
  const b2 = { x: b.x + nx * offset, y: b.y + ny * offset };
  extensionLine(canvas, a, a2);
  extensionLine(canvas, b, b2);
  canvas.add(line(a2.x, a2.y, b2.x, b2.y, dimStroke), [a2, b2]);
  arrowHead(canvas, a2, { x: -ux, y: -uy });
  arrowHead(canvas, b2, { x: ux, y: uy });
  // text sits a little further out, rotated into the readable half-plane
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (deg <= -90) deg += 180;
  while (deg > 90) deg -= 180;
  const lift = offset >= 0 ? 6 : -6;
  dimText(
    canvas,
    (a2.x + b2.x) / 2 + nx * lift,
    (a2.y + b2.y) / 2 + ny * lift,
    label,
    { rotate: deg },
  );
  return { a2, b2 };
}

/**
 * Angle arc at `vertex` between two directions, with a dashed datum ray.
 * `from`/`to` are unit vectors in panel space; the arc is drawn at r = 70,
 * legacy radius.
 */
export function angleDim(canvas, {
  vertex, from, to, label, radius = 70, datumLength = 80, labelRadius = 78,
  labelSide = 'inside',
}) {
  // dashed datum ray (the reference the angle is measured from)
  const dEnd = { x: vertex.x + from.x * datumLength, y: vertex.y + from.y * datumLength };
  canvas.add(
    line(vertex.x, vertex.y, dEnd.x, dEnd.y, {
      stroke: PALETTE.dim,
      'stroke-width': STROKE.tenonDash.toFixed(2),
      'stroke-linecap': 'butt',
      'stroke-dasharray': DASH.sight,
    }),
    [vertex, dEnd],
  );
  const p0 = { x: vertex.x + from.x * radius, y: vertex.y + from.y * radius };
  const p1 = { x: vertex.x + to.x * radius, y: vertex.y + to.y * radius };
  const cross = from.x * to.y - from.y * to.x;
  const sweep = cross > 0 ? 1 : 0;
  canvas.add(
    path(`M${num(p0.x)},${num(p0.y)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 ${sweep} ${num(p1.x)},${num(p1.y)}`,
      { fill: 'none', stroke: PALETTE.dim, 'stroke-width': STROKE.arc.toFixed(1) }),
    [p0, p1],
  );
  let mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (labelSide === 'outside') {
    // reflect the bisector across the datum so a narrow wedge (a leg lying
    // right along the arc) does not get the label printed on top of it
    const dot = mid.x * from.x + mid.y * from.y;
    mid = { x: 2 * dot * from.x - mid.x, y: 2 * dot * from.y - mid.y };
  }
  const mlen = Math.hypot(mid.x, mid.y) || 1;
  dimText(
    canvas,
    vertex.x + (mid.x / mlen) * labelRadius,
    vertex.y + (mid.y / mlen) * labelRadius,
    label,
    { size: FONT.angle, weight: 'bold' },
  );
}

/** Leader line + note, legacy style (thin dashed leader, plain-weight text). */
export function leaderNote(canvas, { from, to, label, anchor = 'middle', size = FONT.note }) {
  canvas.add(
    line(from.x, from.y, to.x, to.y, {
      stroke: PALETTE.dim,
      'stroke-width': '0.80',
      'stroke-linecap': 'butt',
      'stroke-dasharray': DASH.ext,
    }),
    [from, to],
  );
  const ty = to.y - 6;
  canvas.add(text(to.x, ty, label, {
    size, fill: PALETTE.dim, anchor, weight: 'normal',
  }));
  const w = textWidth(label, size);
  const dx = anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0;
  canvas.box(to.x - dx, ty - size, w, size * 1.35);
}

/** Free-standing annotation, no leader (legacy "6 backsticks — plumb"). */
export function note(canvas, { x, y, label, anchor = 'start', size = FONT.note, italic = false, fill = PALETTE.dim }) {
  canvas.add(text(x, y, label, { size, fill, anchor, weight: 'normal', italic }));
  const w = textWidth(label, size);
  const dx = anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0;
  canvas.box(x - dx, y - size, w, size * 1.35);
}

export const RAIL = DIM_RAIL;
