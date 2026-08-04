// curve.js — planar sampled curves. THE one module that handles curves.
//
// SPEC.md v0.2 makes the "planar sampled curve" the single primitive for every
// curved member: a comb curved in plan, a steam-bent armbow, a traced seat
// outline. v0.3 (tilted-plane curves: sack-back arm + back bow) and v2 (true
// space curves: continuous arm, serpentine sticks) must slot in by adding a
// pose/lift AROUND these functions, never by changing consumers — so all curve
// maths lives here and nowhere else.
//
// ---------------------------------------------------------------------------
// EXPORTED API (stable — the renderer, the annotator's curve-tracing UX and
// any later consumer import exactly these; add, don't change)
// ---------------------------------------------------------------------------
//
//   Points are plain `{x, y}` objects in ONE plane. The module is deliberately
//   frame-agnostic: chairagram plan curves are (x, z) in the chair frame and
//   pass z as `y`; an annotator tracing on a photo passes screen pixels. Spec
//   JSON stores `[[x, z], ...]` pairs — fromPairs/toPairs convert.
//
//   CURVE                                  frozen fixed parameters (below)
//   unitScale(units)          -> number    1 for "in", 25.4 for "mm"
//   arcStepFor(units)         -> number    resampling step in spec units
//   fitToleranceFor(units)    -> number    circle-fit tolerance in spec units
//   fromPairs([[x,y],…])      -> [{x,y}]
//   toPairs([{x,y}])          -> [[x,y],…]
//   arcLength(pts, opts?)     -> number    polyline length (opts.closed)
//   chordLength(pts)          -> number    |last − first|
//   extents(pts)              -> {minX,maxX,minY,maxY,width,height}
//   smooth(pts, opts?)        -> [{x,y}]   centripetal Catmull-Rom, FIXED params
//   resampleByArcLength(pts, step, opts?)  -> [{x,y}]  even spacing, ends exact
//   samplePlanCurve(pts, opts?)            -> [{x,y}]  smooth + resample
//   pointAtArcLength(pts, s)  -> {x,y,tx,ty}
//   stationsByArcLength(pts, count, opts?) -> [{x,y,tx,ty,s}]
//   scaleToArcLength(pts, target)          -> [{x,y}]  scaled about the arc mid
//   offsetBand(pts, width)    -> {left,right,ring}
//   circleFrom3(a,b,c)        -> {cx,cy,r} | null      (null when collinear)
//   fitCircle(pts, tol)       -> {cx,cy,r,maxDeviation,fits} | null
//   maxChordDeviation(pts)    -> number    how far it wanders off its own chord
//   selfIntersects(pts, opts?)-> boolean
//
// DETERMINISM. Every parameter that shapes the output is a constant in this
// file — nothing is derived from timing, randomness or input-dependent
// heuristics, so the same stored points always produce the same samples, and
// two renders are byte-identical. SPEC.md forbids resampling stored curves on
// LOAD for the same reason: smoothing happens at DRAW time, here, with these
// fixed parameters.

/**
 * Fixed curve parameters. Changing any of these changes every drawing, so
 * treat them as part of the renderer's output contract.
 *
 *   alpha            0.5 = centripetal Catmull-Rom (no cusps, no self-
 *                    intersection on the kind of hand-traced points a comb or
 *                    an armbow produces; uniform CR overshoots badly there).
 *   spanSubdivisions samples generated per input span before resampling.
 *   stepIn           arc-length resampling step, INCHES. Scaled by unitScale()
 *                    for mm specs so a 500 mm bow is not sampled 2000 times.
 *   fitToleranceIn   how far a traced curve may sit off a true circle and
 *                    still be labelled with that radius: 1/16 in, the
 *                    chairmaker's "close enough to scribe it" band.
 */
export const CURVE = Object.freeze({
  alpha: 0.5,
  spanSubdivisions: 16,
  stepIn: 0.25,
  fitToleranceIn: 0.0625,
});

const EPS = 1e-12;

/** Spec units per inch. */
export function unitScale(units) {
  return units === 'mm' ? 25.4 : 1;
}

/** Arc-length resampling step, in the spec's own units. */
export function arcStepFor(units) {
  return CURVE.stepIn * unitScale(units);
}

/** Circle-fit tolerance, in the spec's own units. */
export function fitToleranceFor(units) {
  return CURVE.fitToleranceIn * unitScale(units);
}

/** `[[x, y], …]` (spec JSON form) -> `[{x, y}, …]`. */
export function fromPairs(pairs) {
  return pairs.map((p) => ({ x: p[0], y: p[1] }));
}

/** `[{x, y}, …]` -> `[[x, y], …]` (spec JSON form). */
export function toPairs(points) {
  return points.map((p) => [p.x, p.y]);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Cumulative arc length at every vertex; `closed` adds the closing segment. */
function cumulative(points, closed = false) {
  const out = [0];
  const n = points.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    out.push(out[i] + dist(points[i], points[(i + 1) % n]));
  }
  return out;
}

/** Total polyline length. */
export function arcLength(points, { closed = false } = {}) {
  if (points.length < 2) return 0;
  const c = cumulative(points, closed);
  return c[c.length - 1];
}

/** Straight-line distance between the two ends. */
export function chordLength(points) {
  if (points.length < 2) return 0;
  return dist(points[0], points[points.length - 1]);
}

/** Axis-aligned bounds. */
export function extents(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

/**
 * Centripetal Catmull-Rom through the given points, with the FIXED parameters
 * above. Closed curves wrap; open curves get a phantom neighbour at each end,
 * extrapolated QUADRATICALLY through the three points nearest that end.
 *
 * The phantom matters more than it looks. Reflecting (p0 = 2·p1 − p2, the usual
 * shortcut) flattens the first and last span, and on a comb traced as a true
 * arc that artifact alone is ~0.19 in on a 30 in radius — enough to fail the
 * circle-fit test and print "varies" for a curve that really is an arc.
 * Quadratic extrapolation carries the curvature into the end spans instead and
 * drops the same error to ~0.016 in. Either way the curve still starts and ends
 * exactly on the first and last traced point.
 *
 * The result is a dense polyline, NOT a resampled one — pass it through
 * resampleByArcLength (or use samplePlanCurve) before drawing.
 */
export function smooth(points, { closed = false } = {}) {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  if (n === 2 && !closed) return [{ ...points[0] }, { ...points[1] }];

  const at = (i) => {
    if (closed) return points[((i % n) + n) % n];
    if (i < 0) {
      if (n < 3) return { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y };
      return {
        x: 3 * points[0].x - 3 * points[1].x + points[2].x,
        y: 3 * points[0].y - 3 * points[1].y + points[2].y,
      };
    }
    if (i > n - 1) {
      if (n < 3) {
        return {
          x: 2 * points[n - 1].x - points[n - 2].x,
          y: 2 * points[n - 1].y - points[n - 2].y,
        };
      }
      return {
        x: 3 * points[n - 1].x - 3 * points[n - 2].x + points[n - 3].x,
        y: 3 * points[n - 1].y - 3 * points[n - 2].y + points[n - 3].y,
      };
    }
    return points[i];
  };

  const spans = closed ? n : n - 1;
  const N = CURVE.spanSubdivisions;
  const out = [];
  for (let i = 0; i < spans; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // knot sequence, centripetal (alpha = 0.5)
    const t0 = 0;
    const t1 = t0 + Math.max(dist(p0, p1) ** CURVE.alpha, EPS);
    const t2 = t1 + Math.max(dist(p1, p2) ** CURVE.alpha, EPS);
    const t3 = t2 + Math.max(dist(p2, p3) ** CURVE.alpha, EPS);
    for (let j = 0; j < N; j += 1) {
      const t = t1 + ((t2 - t1) * j) / N;
      // Barry–Goldman pyramid
      const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
      const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
      const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
      const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
      const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
      out.push(mix(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  if (!closed) out.push({ x: points[n - 1].x, y: points[n - 1].y });
  return out;
}

function mix(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ---------------------------------------------------------------------------
// Arc-length sampling
// ---------------------------------------------------------------------------

/**
 * Even arc-length sampling. The requested `step` is nudged to the nearest step
 * that divides the curve a whole number of times, so BOTH ends land exactly on
 * the curve (an open curve keeps its first and last point) and the sample count
 * is a pure function of the geometry — never a rounding accident.
 */
export function resampleByArcLength(points, step, { closed = false } = {}) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const cum = cumulative(points, closed);
  const total = cum[cum.length - 1];
  if (!(total > 0) || !(step > 0)) return points.map((p) => ({ x: p.x, y: p.y }));
  const n = Math.max(1, Math.round(total / step));
  const dt = total / n;
  const count = closed ? n : n + 1;
  const out = [];
  let seg = 0;
  for (let i = 0; i < count; i += 1) {
    const s = Math.min(i * dt, total);
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg += 1;
    const segLen = cum[seg + 1] - cum[seg];
    const t = segLen > 0 ? (s - cum[seg]) / segLen : 0;
    const a = points[seg];
    const b = points[(seg + 1) % points.length];
    out.push(mix(a, b, t));
  }
  if (!closed) {
    // pin the far end exactly, so `length` and the drawn curve agree
    out[out.length - 1] = { x: points[points.length - 1].x, y: points[points.length - 1].y };
  }
  return out;
}

/**
 * The one call a renderer or the annotator makes: smooth the stored trace, then
 * resample it evenly by arc length. `units` picks the fixed step; pass `step`
 * to override (tests do), `closed` for a seat outline.
 */
export function samplePlanCurve(points, { units = 'in', step = null, closed = false } = {}) {
  const s = step === null ? arcStepFor(units) : step;
  return resampleByArcLength(smooth(points, { closed }), s, { closed });
}

/** Point (and unit tangent) at arc length `s` along the polyline. */
export function pointAtArcLength(points, s) {
  if (points.length === 0) return null;
  if (points.length === 1) return { x: points[0].x, y: points[0].y, tx: 1, ty: 0 };
  const cum = cumulative(points, false);
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(s, total));
  let seg = 0;
  while (seg < cum.length - 2 && cum[seg + 1] < target) seg += 1;
  const a = points[seg];
  const b = points[seg + 1];
  const segLen = cum[seg + 1] - cum[seg];
  const t = segLen > 0 ? (target - cum[seg]) / segLen : 0;
  const p = mix(a, b, t);
  const len = dist(a, b) || 1;
  return { x: p.x, y: p.y, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len };
}

/**
 * `count` stations spaced evenly BY ARC LENGTH along the curve.
 *
 * Default (`includeEnds: false`) puts them strictly between the ends, at
 * (i + 1)/(count + 1) of the length — which is what "spindles spaced evenly by
 * arc length between the tips" means: no spindle sits ON a tip, where the hand
 * is. `includeEnds: true` spreads them from end to end instead.
 */
export function stationsByArcLength(points, count, { includeEnds = false } = {}) {
  if (count <= 0 || points.length < 2) return [];
  const total = arcLength(points);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const f = includeEnds
      ? (count === 1 ? 0.5 : i / (count - 1))
      : (i + 1) / (count + 1);
    const s = total * f;
    out.push({ ...pointAtArcLength(points, s), s });
  }
  return out;
}

/**
 * Scale a curve about its arc midpoint until its length is `target`. The
 * traced points give the SHAPE; a stored length (SPEC.md: `crest.length` is the
 * along-curve length) gives the SIZE, and the two must agree before anything is
 * drawn or labelled.
 */
export function scaleToArcLength(points, target) {
  const len = arcLength(points);
  if (!(len > 0) || !(target > 0)) return points.map((p) => ({ x: p.x, y: p.y }));
  const f = target / len;
  const mid = pointAtArcLength(points, len / 2);
  return points.map((p) => ({
    x: mid.x + (p.x - mid.x) * f,
    y: mid.y + (p.y - mid.y) * f,
  }));
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

/**
 * Centreline ± half `width`: the plan footprint of a member of that section
 * swept along the curve. Returns the two edges plus a closed ring (left edge,
 * then the right edge reversed) ready to draw as one polygon.
 *
 * Corner normals are averaged and mitre-corrected, capped so a sharp corner
 * widens the band a little instead of shooting off to infinity.
 */
export function offsetBand(points, width) {
  const h = width / 2;
  const n = points.length;
  const MITRE_CAP = 2;
  /** Left-hand unit normal of the segment starting at index i. */
  const segNormal = (i) => {
    const a = points[i];
    const b = points[i + 1];
    const len = dist(a, b);
    if (len < EPS) return null;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };
  const normals = [];
  for (let i = 0; i < n - 1; i += 1) normals.push(segNormal(i));
  // fill any zero-length gaps so every vertex has a usable direction
  let fallback = normals.find(Boolean) || { x: 0, y: 1 };
  for (let i = 0; i < normals.length; i += 1) {
    if (!normals[i]) normals[i] = fallback;
    else fallback = normals[i];
  }

  const left = [];
  const right = [];
  for (let i = 0; i < n; i += 1) {
    const n1 = normals[Math.max(0, Math.min(i - 1, normals.length - 1))] || fallback;
    const n2 = normals[Math.max(0, Math.min(i, normals.length - 1))] || fallback;
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const len = Math.hypot(nx, ny);
    if (len < EPS) { nx = n2.x; ny = n2.y; } else { nx /= len; ny /= len; }
    // mitre: at a corner the offset has to reach further than half the width
    const cos = nx * n2.x + ny * n2.y;
    const scale = cos > 1 / MITRE_CAP ? 1 / cos : MITRE_CAP;
    left.push({ x: points[i].x + nx * h * scale, y: points[i].y + ny * h * scale });
    right.push({ x: points[i].x - nx * h * scale, y: points[i].y - ny * h * scale });
  }
  return { left, right, ring: [...left, ...right.slice().reverse()] };
}

// ---------------------------------------------------------------------------
// Circle fitting
// ---------------------------------------------------------------------------

/**
 * The circle through three points, EXACTLY (no iteration, no least squares).
 * Returns null when the three are collinear — which is the honest answer, and
 * the reason the "label a radius" rule has a "varies" branch at all.
 */
export function circleFrom3(a, b, c) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const cross = abx * acy - aby * acx;
  const scale = Math.hypot(abx, aby) * Math.hypot(acx, acy);
  if (scale < EPS || Math.abs(cross) < 1e-9 * scale) return null;   // collinear
  const ab2 = abx * abx + aby * aby;
  const ac2 = acx * acx + acy * acy;
  const ux = (acy * ab2 - aby * ac2) / (2 * cross);
  const uy = (abx * ac2 - acx * ab2) / (2 * cross);
  const cx = a.x + ux;
  const cy = a.y + uy;
  return { cx, cy, r: Math.hypot(ux, uy) };
}

/**
 * Does a single circle genuinely fit this curve?
 *
 * Fits the exact circle through the first, arc-middle and last points, then
 * measures every point against it. `fits` is the whole point: a comb bent over
 * a form is a true arc and deserves a printed radius; a comb shaped by eye is
 * not, and gets "varies" instead of a number that would send someone to the
 * bandsaw with the wrong template.
 */
export function fitCircle(points, tolerance) {
  if (points.length < 3) return null;
  const mid = pointAtArcLength(points, arcLength(points) / 2);
  const circle = circleFrom3(points[0], { x: mid.x, y: mid.y }, points[points.length - 1]);
  if (!circle) return null;
  let maxDeviation = 0;
  for (const p of points) {
    const d = Math.abs(Math.hypot(p.x - circle.cx, p.y - circle.cy) - circle.r);
    if (d > maxDeviation) maxDeviation = d;
  }
  return { ...circle, maxDeviation, fits: maxDeviation <= tolerance };
}

/**
 * The furthest any point strays from the straight line between the two ends.
 *
 * The companion to fitCircle, and the reason a curve can have no radius for two
 * opposite reasons: fitCircle returns null for a DEAD STRAIGHT trace (no circle
 * passes through three collinear points) exactly as it does for a curve shaped
 * by eye. Within the same tolerance, this is what tells them apart — a comb
 * traced along a straight edge is maximally regular, not "varies".
 */
export function maxChordDeviation(points) {
  if (points.length < 2) return 0;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return Infinity;      // a closed ring has no chord to speak of
  let worst = 0;
  for (const p of points) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (d > worst) worst = d;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Polygon sanity
// ---------------------------------------------------------------------------

function segmentsCross(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < EPS) return false;                 // parallel
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
}

/**
 * Does the polyline (or, with `closed`, the polygon) cross itself?
 * SPEC.md v0.2 makes a self-intersecting traced seat outline a WARNING, not a
 * failure: the user still gets their drawing, with a note that the trace needs
 * a look.
 */
export function selfIntersects(points, { closed = true } = {}) {
  const n = points.length;
  if (n < 4) return false;
  const segs = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) segs.push([points[i], points[(i + 1) % n]]);
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 2; j < segs.length; j += 1) {
      if (closed && i === 0 && j === segs.length - 1) continue;   // adjacent at the seam
      if (segmentsCross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) return true;
    }
  }
  return false;
}
