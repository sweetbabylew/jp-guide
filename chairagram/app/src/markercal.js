// markercal.js — marker-driven calibration, and the photo-intake rules that
// feed it (EXIF orientation, HEIC sniffing, detection downscale).
//
// PURE. No DOM, no fetch at call time, no Date, no random. The step modules own
// every pixel of UI; this file owns the arithmetic and the trust decision, so
// app/test.mjs can judge it against marker/'s synthetic scenes.
//
// ---------------------------------------------------------------------------
// What this consumes, and what it is NEVER allowed to invent
// ---------------------------------------------------------------------------
// MARKER.md, "Consumed by the app (3b)": the annotator imports `detect.js` and
// the manifests VERBATIM. Not one geometry constant is duplicated here.
//
//   * `manifest.tags[k].borderCorners` (48 mm square, `tag.borderSizeMm`) are
//     the ONLY metric datum. `tag.sizeMm` (60 mm, the printed bitmap) is never
//     a scale source — mixing them is a 25% error.
//   * detector corner j corresponds to `borderCorners[j]` with no matching
//     step: the tags are printed unrotated, so corner j is a fixed physical
//     corner however the photo is turned (measured in marker/test.mjs, section
//     0, "corner convention").
//   * `variantForIds()` decides the paper size from the detected IDs.
//   * `quadDecimate` stays 1.0. Speed comes from `planDetectionDownscale()`
//     shrinking the IMAGE, never from decimating inside the detector.
//
// The linear algebra is imported from marker/src/warp.js rather than rewritten:
// that is the same DLT the 3a acceptance harness measured to sub-pixel
// accuracy, which is what makes the synthetic suite a valid referee for the
// app. `homographyFromPoints` there takes 4 points or any over-determined set.

import {
  homographyFromPoints, applyH, invertH,
} from '../../marker/src/warp.js';
import { variantForIds, VARIANTS } from '../../marker/src/sheet.js';
import { MM_PER_IN } from './homography.js';

export { variantForIds };

// ---------------------------------------------------------------------------
// Tunables — every one of these was measured, not guessed. See app/test.mjs
// "marker calibration" and the table in the phase-3b report.
// ---------------------------------------------------------------------------

/**
 * Long side, in pixels, of the copy handed to the detector.
 *
 * The 3a suite measured the detection floor at ~36 px/tag (oblique + blur +
 * noise). A 60 mm tag on a 279 mm sheet is 21.5% of the sheet's width, so a
 * sheet filling a quarter of the frame gives 0.054 * longSide px/tag: 1600 px
 * leaves ~86 px/tag, comfortably above the 60 px/tag line where the suite
 * still holds corner RMS under 0.5 px. A 12 Mpx phone photo shrinks ~6x in
 * pixel count, which is where the time goes — NOT into quadDecimate.
 */
export const DETECT_LONG_SIDE = 1600;

/** Fewer tags than this and there is nothing to solve. (MARKER.md: "< 2 tags → manual".) */
export const MIN_TAGS = 2;

/**
 * Self-consistency residual limit: detected corners pushed back through H⁻¹
 * and compared to the manifest, RMS in sheet millimetres.
 *
 * Measured on the 3a scenes: 0.01 mm (plumb top view) to 0.55 mm (4° grazing
 * floor sheet with blur 2 + noise 14). MARKER.md's own degraded bound against
 * ground truth is 2 mm. 1.5 mm therefore never fires on a sheet the detector
 * reads cleanly, and does fire on the real-world failure this is for: a tag
 * half-hidden by a chair leg, a folded sheet, a mis-decoded corner.
 */
export const RESIDUAL_MAX_MM = 1.5;

/**
 * Jackknife limits. Leave-one-CORNER-out, refit, and watch what the OUTPUT
 * does — the scale we hand the user and the points we draw. This is the gate
 * that matters, because a plane homography fits a plane exactly: with 8
 * correspondences (2 tags) and 8 degrees of freedom the residual above is
 * ~0 BY CONSTRUCTION even when the geometry is hopeless.
 *
 * Measured spreads (max over all leave-one-out refits):
 *   4 tags, any obliquity the detector reads   scale ≤ 0.03%, points ≤ 0.28 px
 *   3 tags                                     scale ≤ 0.03%, points ≤ 0.28 px
 *   2 FRONT tags (chair hides the sheet's back) scale ≤ 0.06%, points ≤ 0.51 px
 *   2 BACK tags (chair hides the front)         scale ≤ 0.27%, points 0.3–3.3 px
 *   2 tags down one edge                        scale 0.06–4.1%, points 0.4–86 px
 * and the true errors track those spreads closely (the 2-back-tag fits really
 * are 0.6–5 px out on the floor line, the down-one-edge fits 0.5–27 px).
 *
 * So: 1.0 px on the elevation's floor line, 1% on the scale, 2.0 px on the top
 * view's paper corners (a 2 px corner error on a ~2000 px rectified canvas is
 * a tenth of a percent, and the corners are extrapolated 12.5 mm past the
 * printed frame to the paper edge).
 *
 * WHICH PIXELS. Those two px limits are DETECTOR pixels — the shrunken copy
 * `planDetectionDownscale()` hands the detector, which is where every number
 * in the table above was measured (the synthetic scenes are detector-sized, so
 * `imageScale` was 1 throughout). It has to stay that way, because the thing
 * being bounded is the detector's own corner noise, and that noise lives in
 * detector pixels: shrink the same photo further and the wobble shrinks with
 * it. `readSheet()` multiplies the detected corners by `imageScale`, so the
 * homography — and everything derived from it — comes out in FULL-RES pixels;
 * `calibrateElevation`/`calibrateTop` therefore divide the jackknife point
 * spread back down by `imageScale` before storing or comparing it.
 *
 * The bug that taught us this (fixed here, regression-tested against the
 * 2026-08 field photos in app/fixtures/): comparing a full-res spread against
 * a detector-resolution limit makes the gate depend on the camera. A 5712 px
 * iPhone frame shrinks 3.57x for detection, so identical detector accuracy
 * read 3.57x worse and nine of ten four-tag field photos were rejected — good
 * calibrations, thrown away for having too many megapixels.
 * `residualMm` (sheet millimetres) and `jkScalePct` (a ratio) were already
 * resolution-invariant; only the point spread had to be normalized.
 *
 * The honest headline from that table: with all four tags the fit is good at
 * every obliquity the detector can still read, and it is PARTIAL detection —
 * not obliquity — that produces an untrustworthy calibration. The rejection
 * wording says exactly that; see REASONS below.
 */
export const JK_SCALE_MAX_PCT = 1.0;
export const JK_FLOOR_MAX_PX = 1.0;
export const JK_CORNER_MAX_PX = 2.0;

// ---------------------------------------------------------------------------
// Manifest loading (the one place that touches the outside world)
// ---------------------------------------------------------------------------

const isNode = typeof process !== 'undefined' && !!process.versions?.node;
const manifestCache = new Map();

/** Same-origin static path of a variant's manifest. No network beyond this. */
export function manifestUrl(variant) {
  return new URL(`../../marker/out/marker-manifest-${variant}.json`, import.meta.url);
}

/** Printable sheet for a variant, for the Photos step's "print this" links. */
export function sheetUrl(variant) {
  return new URL(`../../marker/out/marker-sheet-${variant}.svg`, import.meta.url);
}

/**
 * loadManifest('letter') -> the manifest object, cached.
 * Browser: a same-origin fetch of a static file. Node: a plain file read, so
 * the tests exercise the identical manifest the browser gets.
 */
export async function loadManifest(variant) {
  if (!VARIANTS[variant]) throw new Error(`markercal: unknown sheet variant "${variant}"`);
  if (manifestCache.has(variant)) return manifestCache.get(variant);
  const url = manifestUrl(variant);
  const p = (async () => {
    if (isNode) {
      const { readFile } = await import('node:fs/promises');
      return JSON.parse(await readFile(url, 'utf8'));
    }
    const res = await fetch(url.href, { credentials: 'omit' });
    if (!res.ok) throw new Error(`markercal: ${url.pathname} returned HTTP ${res.status}`);
    return res.json();
  })();
  manifestCache.set(variant, p);
  return p;
}

// ---------------------------------------------------------------------------
// Detection plumbing
// ---------------------------------------------------------------------------

/**
 * How much to shrink a photo before detection. Never upscales.
 * `scale` is the factor that takes DETECTION pixels back to FULL-RES pixels.
 */
export function planDetectionDownscale(width, height, longSide = DETECT_LONG_SIDE) {
  const long = Math.max(width, height);
  if (!(long > 0)) throw new Error('markercal: image has no size');
  const k = long > longSide ? longSide / long : 1;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
    scale: 1 / k,
  };
}

/**
 * Detections -> {variant, tags} keyed to the manifest, in full-resolution
 * pixels. Duplicated IDs keep the first detection; IDs from the other paper
 * size (or from nowhere) are dropped.
 */
export function readSheet(detections, manifest, imageScale = 1) {
  const ids = [];
  const byId = new Map();
  for (const d of detections || []) {
    if (!d || !Array.isArray(d.corners) || d.corners.length !== 4) continue;
    if (byId.has(d.id)) continue;
    byId.set(d.id, d);
    ids.push(d.id);
  }
  const variant = variantForIds(ids);
  if (!variant) return { variant: null, tags: [] };
  const tags = [];
  for (const tag of manifest.tags) {
    const d = byId.get(tag.id);
    if (!d) continue;
    tags.push({
      id: tag.id,
      role: tag.role,
      mm: tag.borderCorners.map((p) => ({ x: p.x, y: p.y })),
      px: d.corners.map((p) => ({ x: p.x * imageScale, y: p.y * imageScale })),
    });
  }
  return { variant, tags };
}

// ---------------------------------------------------------------------------
// The sheet plane
// ---------------------------------------------------------------------------

function pairsOf(tags) {
  const src = [];
  const dst = [];
  for (const t of tags) {
    for (let k = 0; k < 4; k += 1) {
      src.push(t.mm[k]);
      dst.push(t.px[k]);
    }
  }
  return { src, dst };
}

/** Homography from sheet millimetres to image pixels, or null. */
function fitPlane(src, dst) {
  if (src.length < 4) return null;
  try {
    return homographyFromPoints(src, dst);
  } catch (err) {
    return null;
  }
}

/** px per mm at a point, measured along the sheet's own X axis through it. */
function scaleAt(H, x, y, spanMm) {
  const a = applyH(H, x - spanMm / 2, y);
  const b = applyH(H, x + spanMm / 2, y);
  return Math.hypot(b.x - a.x, b.y - a.y) / spanMm;
}

/**
 * Solve the sheet plane and score it.
 *
 * `probes` are the sheet-mm points whose stability decides trust — i.e. the
 * points this calibration is actually going to draw. Everything reported is
 * measurable without ground truth, because in the field there is none.
 *
 * UNITS: `residualPx`, `scalePxPerMm` and `jkPointPx` come out in whatever
 * pixel space `tags[].px` was given in — full-res, once `readSheet()` has
 * applied `imageScale`. `residualMm` and `jkScalePct` are scale-free. The two
 * calibrate* functions normalize `jkPointPx` back to detector pixels before
 * gating on it; see the tunables comment. Nothing here divides, because this
 * function has not been told what the image scale was.
 */
export function solveSheetPlane(tags, manifest, probes) {
  const { src, dst } = pairsOf(tags);
  const H = fitPlane(src, dst);
  if (!H) return null;
  const Hi = invertH(H);

  let sqPx = 0;
  let sqMm = 0;
  for (let i = 0; i < src.length; i += 1) {
    const f = applyH(H, src[i].x, src[i].y);
    sqPx += (f.x - dst[i].x) ** 2 + (f.y - dst[i].y) ** 2;
    const b = applyH(Hi, dst[i].x, dst[i].y);
    sqMm += (b.x - src[i].x) ** 2 + (b.y - src[i].y) ** 2;
  }
  const n = src.length;
  const residualPx = Math.sqrt(sqPx / n);
  const residualMm = Math.sqrt(sqMm / n);

  // datum-line scale: px per mm in the plane the chair's front sits in
  const datumSpan = Math.abs(manifest.datum.end.x - manifest.datum.start.x);
  const scale0 = scaleAt(H, 0, manifest.datum.start.y, datumSpan);

  // leave-one-corner-out: how far do the drawn points and the scale move?
  const base = probes.map((p) => applyH(H, p.x, p.y));
  let jkScalePct = 0;
  let jkPointPx = 0;
  if (n >= 5) {
    for (let drop = 0; drop < n; drop += 1) {
      const s = src.filter((_, i) => i !== drop);
      const d = dst.filter((_, i) => i !== drop);
      const Hj = fitPlane(s, d);
      if (!Hj) { jkScalePct = Infinity; jkPointPx = Infinity; break; }
      const sj = scaleAt(Hj, 0, manifest.datum.start.y, datumSpan);
      jkScalePct = Math.max(jkScalePct, Math.abs((100 * (sj - scale0)) / scale0));
      probes.forEach((p, i) => {
        const q = applyH(Hj, p.x, p.y);
        jkPointPx = Math.max(jkPointPx, Math.hypot(q.x - base[i].x, q.y - base[i].y));
      });
    }
  } else {
    // 4 correspondences exactly determine H; there is no evidence left over to
    // check it with, so it is not trusted.
    jkScalePct = Infinity;
    jkPointPx = Infinity;
  }

  return {
    H,
    points: base,
    correspondences: n,
    residualPx,
    residualMm,
    scalePxPerMm: scale0,
    jkScalePct,
    jkPointPx,
  };
}

// ---------------------------------------------------------------------------
// Print-scale correction (the typed ruler measurement)
// ---------------------------------------------------------------------------

/**
 * The sheet's geometry is nominal — it assumes the printer was honest. If the
 * user measured the printed verification bar and typed what they got, every
 * millimetre on the sheet is really `k` times what the manifest says.
 *
 * `ruler` is {value, unit}: 'mm' means they measured the 100 mm bar, 'in' the
 * 4 in bar. Nominal lengths come from the manifest's own ruler entries.
 * Returns null when nothing was typed (print-perfect assumed, k = 1).
 */
export function rulerScale(manifest, ruler) {
  if (!ruler || !Number.isFinite(ruler.value) || !(ruler.value > 0)) return null;
  const unit = ruler.unit === 'in' ? 'in' : 'mm';
  const bar = manifest.rulers.find((r) => (unit === 'in' ? r.id === 'ruler-4in' : r.id === 'ruler-100mm'));
  if (!bar) return null;
  const measuredMm = unit === 'in' ? ruler.value * MM_PER_IN : ruler.value;
  const k = measuredMm / bar.lengthMm;
  // A tape read as half or double the bar is a typo, not a printer.
  if (!(k > 0.8 && k < 1.25)) return null;
  return {
    k,
    pct: (k - 1) * 100,
    nominalMm: bar.lengthMm,
    measuredMm,
    barId: bar.id,
    unit,
  };
}

// ---------------------------------------------------------------------------
// Sheet-frame geometry pulled out of the manifest (no constants of our own)
// ---------------------------------------------------------------------------

/**
 * True length of the printed SEAT FRONT datum line, in millimetres, after the
 * typed ruler measurement is taken into account. This is the number that goes
 * in the scale input, and the only thing the print-scale correction changes:
 * the two image points stay exactly where the sheet is.
 */
export function datumLengthMm(manifest, ruler) {
  const k = rulerScale(manifest, ruler);
  const nominal = Math.abs(manifest.datum.end.x - manifest.datum.start.x);
  return round4(nominal * (k ? k.k : 1));
}

/** The two ends of the printed frame's front edge — the floor line we draw. */
function floorProbes(manifest) {
  const y = manifest.datum.start.y; // the datum line IS the sheet origin's y
  return [{ x: manifest.frame.xMinMm, y }, { x: manifest.frame.xMaxMm, y }];
}

/** The datum line's own printed ends — the dimension line we draw. */
function datumProbes(manifest) {
  return [
    { x: manifest.datum.start.x, y: manifest.datum.start.y },
    { x: manifest.datum.end.x, y: manifest.datum.end.y },
  ];
}

/**
 * The four PAPER corners in sheet millimetres, ring order
 * [back-left, back-right, front-right, front-left].
 *
 * Derived from the manifest's page transform and paper size, NOT measured off
 * the photo — MARKER.md is explicit that the paper edge is never a datum. The
 * metric scale still comes only from the tags; this just says where a sheet of
 * that size would have to be, which is what the existing rectify pipeline
 * (homography.js `rectifyPlan`, sized from `paperDims`) wants as input.
 */
export function paperCornersMm(manifest) {
  const o = manifest.pageTransform.originPageMm;
  const W = manifest.paper.widthMm;
  const H = manifest.paper.heightMm;
  const toSheet = (px, py) => ({ x: px - o.x, y: o.y - py });
  return [toSheet(0, 0), toSheet(W, 0), toSheet(W, H), toSheet(0, H)];
}

// ---------------------------------------------------------------------------
// The two calibrations
// ---------------------------------------------------------------------------

/**
 * An empty, JSON-safe result. The store's default, and the whole vocabulary
 * the later workstreams read: everything a prefill needs is IN the record, so
 * it survives export → import and can be re-applied without re-detecting.
 */
export function emptyResult() {
  return {
    status: 'none',        // none | used | rejected
    variant: null,         // 'letter' | 'a4'
    found: 0,              // tags matched to the manifest
    residualPx: null,      // RMS fit residual, image px
    residualMm: null,      // RMS fit residual, sheet mm  <- the headline gate
    jkScalePct: null,      // leave-one-corner-out spread of the scale, %
    // Leave-one-corner-out spread of the drawn points, in DETECTOR pixels —
    // the shrunken copy detection ran on, NOT the full-res photo. That is the
    // space the limits were measured in and the space the detector's corner
    // noise lives in, so it is the only reading that means the same thing on a
    // 3 Mpx photo and a 48 Mpx one. See the tunables comment above.
    jkPointPx: null,
    scalePxPerMm: null,    // at the datum line = the chair's front plane
    floorLine: null,       // {a, b} image px, elevations
    scaleLine: null,       // {a, b, valueMm} image px + true length, elevations
    rectifyCorners: null,  // [4] image px paper corners, top view
    sheetH: null,          // [9] sheet mm -> image px, row-major
    reason: null,          // plain-language why-not, for the quiet note
  };
}

/**
 * Why a sheet was not used, in words a chairmaker can act on.
 *
 * The jackknife failure used to be reported as "too oblique", which was the
 * one thing the measured table (see the tunables comment) says it is NOT: with
 * all four tags the fit holds at every obliquity the detector can still read.
 * So the failure is named by what actually went wrong —
 *
 *   * `partial(n)` — fewer than four tags decoded, which is the real-world
 *     failure mode: the chair, a shadow or the frame edge is covering part of
 *     its own sheet, and the corners that survive do not pin the plane down.
 *   * `unstable`   — all four tags decoded and the fit still moves too much
 *     when one corner is dropped. Rare, and worth its own sentence: it means a
 *     mis-decoded or smeared corner, not a camera angle.
 *
 * Either way the calibration lands in the manual path with a named reason
 * (DECISIONS D8), which is the part that must never change.
 */
const REASONS = {
  none: null,
  notFound: 'no printed sheet found in this photo',
  tooFew: 'only one tag was readable — the sheet needs at least two',
  residual: 'the tags do not agree on one flat sheet (creased, folded, or a bad detection)',
  partial: (found) => `only ${found} of 4 tags were readable — not enough of the sheet `
    + 'to trust; calibrate manually',
  unstable: 'the sheet was found but the fit is unstable — a corner disagrees; calibrate manually',
};

/** The record to store when detection ran and saw no sheet at all. */
export function noSheetResult() {
  const r = emptyResult();
  r.reason = REASONS.notFound;
  return r;
}

/**
 * The trust decision. `metrics.jkPointPx` must already be in DETECTOR pixels;
 * `found` is how many of the manifest's four tags decoded, which is what tells
 * a bad fit from a half-covered sheet.
 */
function verdict(metrics, limits) {
  const { residualMm, jkScalePct, jkPointPx, found } = metrics;
  if (!(residualMm <= limits.residualMm)) return { ok: false, reason: REASONS.residual };
  if (!(jkScalePct <= limits.scalePct) || !(jkPointPx <= limits.pointPx)) {
    return { ok: false, reason: found < 4 ? REASONS.partial(found) : REASONS.unstable };
  }
  return { ok: true, reason: null };
}

/**
 * Detector-pixel jackknife spread from a fit that ran in full-res pixels.
 * Infinity (an under-determined fit) stays Infinity, which still fails.
 */
function jkPointDetectorPx(fit, imageScale) {
  const s = Number.isFinite(imageScale) && imageScale > 0 ? imageScale : 1;
  return fit.jkPointPx / s;
}

/**
 * ELEVATIONS — the floor sheet.
 *
 * PROJECTIVE ASSUMPTIONS, stated plainly because they are doing real work:
 *
 *  1. The sheet is flat on the floor and its SEAT FRONT datum line lies plumb
 *     below the seat's front edge (that is what the sheet's own printed
 *     instruction asks for). So the datum line lies IN the chair's front
 *     plane, at floor level.
 *  2. The homography we solve is exact for the floor plane — no assumption
 *     there. What it buys is the px-per-mm ALONG THE DATUM LINE, which is a
 *     scale measured inside the chair's front plane.
 *  3. Extending that one scale to the whole front plane — to heights above the
 *     floor — assumes the camera was LEVEL and square to the chair's front,
 *     i.e. that the front plane is parallel to the sensor. Under a pinhole
 *     camera a plane parallel to the image plane projects at a single uniform
 *     scale, so under that assumption the datum-line scale is the front
 *     plane's scale everywhere, exactly.
 *  4. When the camera is pitched down by θ, scale in the front plane goes as
 *     f / (Z₀ − h·sinθ) with height h: shooting a 1 m chair from 1.4 m up at
 *     3.5 m back (θ ≈ 14°) reads the crest ~5–10% small. We cannot measure θ
 *     from a planar marker without the camera's focal length — that is
 *     focal self-calibration, explicitly out of scope — so we do not pretend
 *     to correct it. The prefill is drawn, editable and never locked, and the
 *     Calibrate step says in words what it assumed.
 *
 * This is exactly the assumption the manual two-click path already makes when
 * it asks for "two points in the same plane as the parts you will click". The
 * sheet does not make it weaker; it just does the clicking.
 */
export function calibrateElevation(detections, manifest, options = {}) {
  const { imageScale = 1, ruler = null } = options;
  const out = emptyResult();
  const { variant, tags } = readSheet(detections, manifest, imageScale);
  out.variant = variant;
  out.found = tags.length;
  if (!variant || tags.length === 0) {
    out.status = 'none';
    out.reason = REASONS.notFound;
    return out;
  }
  if (tags.length < MIN_TAGS) {
    out.status = 'rejected';
    out.reason = REASONS.tooFew;
    return out;
  }

  const floor = floorProbes(manifest);
  const datum = datumProbes(manifest);
  const fit = solveSheetPlane(tags, manifest, [...floor, ...datum]);
  if (!fit) {
    out.status = 'rejected';
    out.reason = REASONS.residual;
    return out;
  }
  const jkPointPx = jkPointDetectorPx(fit, imageScale);
  Object.assign(out, {
    residualPx: fit.residualPx,
    residualMm: fit.residualMm,
    jkScalePct: Number.isFinite(fit.jkScalePct) ? fit.jkScalePct : null,
    jkPointPx: Number.isFinite(jkPointPx) ? jkPointPx : null,
    scalePxPerMm: fit.scalePxPerMm,
    sheetH: fit.H.slice(),
  });

  const v = verdict({
    residualMm: fit.residualMm,
    jkScalePct: fit.jkScalePct,
    jkPointPx,
    found: out.found,
  }, {
    residualMm: RESIDUAL_MAX_MM,
    scalePct: JK_SCALE_MAX_PCT,
    pointPx: JK_FLOOR_MAX_PX,
  });
  if (!v.ok) {
    out.status = 'rejected';
    out.reason = v.reason;
    return out;
  }

  out.status = 'used';
  out.floorLine = { a: fit.points[0], b: fit.points[1] };
  out.scaleLine = {
    a: fit.points[2],
    b: fit.points[3],
    valueMm: datumLengthMm(manifest, ruler),
  };
  return out;
}

/**
 * TOP VIEW — the sheet on the seat.
 *
 * No level-camera assumption here: the whole top view is one plane, the sheet
 * is in it, and the rectification is exact for that plane. The output is the
 * four paper corners in photo pixels, which is precisely what the manual
 * 4-corner click produces — so the existing rectify → grid → landmark pipeline
 * downstream is untouched, corner handles still drag, and the manual path is
 * still there when no sheet is found.
 */
export function calibrateTop(detections, manifest, options = {}) {
  const { imageScale = 1 } = options;
  const out = emptyResult();
  const { variant, tags } = readSheet(detections, manifest, imageScale);
  out.variant = variant;
  out.found = tags.length;
  if (!variant || tags.length === 0) {
    out.status = 'none';
    out.reason = REASONS.notFound;
    return out;
  }
  if (tags.length < MIN_TAGS) {
    out.status = 'rejected';
    out.reason = REASONS.tooFew;
    return out;
  }

  const corners = paperCornersMm(manifest);
  const fit = solveSheetPlane(tags, manifest, corners);
  if (!fit) {
    out.status = 'rejected';
    out.reason = REASONS.residual;
    return out;
  }
  const jkPointPx = jkPointDetectorPx(fit, imageScale);
  Object.assign(out, {
    residualPx: fit.residualPx,
    residualMm: fit.residualMm,
    jkScalePct: Number.isFinite(fit.jkScalePct) ? fit.jkScalePct : null,
    jkPointPx: Number.isFinite(jkPointPx) ? jkPointPx : null,
    scalePxPerMm: fit.scalePxPerMm,
    sheetH: fit.H.slice(),
  });

  const v = verdict({
    residualMm: fit.residualMm,
    jkScalePct: fit.jkScalePct,
    jkPointPx,
    found: out.found,
  }, {
    residualMm: RESIDUAL_MAX_MM,
    scalePct: JK_SCALE_MAX_PCT,
    pointPx: JK_CORNER_MAX_PX,
  });
  if (!v.ok) {
    out.status = 'rejected';
    out.reason = v.reason;
    return out;
  }

  out.status = 'used';
  out.rectifyCorners = fit.points.map((p) => ({ x: p.x, y: p.y }));
  return out;
}

/** One entry point: 'top' takes the seat placement, anything else the floor. */
export function calibrateView(viewId, detections, manifest, options = {}) {
  return viewId === 'top'
    ? calibrateTop(detections, manifest, options)
    : calibrateElevation(detections, manifest, options);
}

// ---------------------------------------------------------------------------
// Applying a prefill — drawn, editable, never locked
// ---------------------------------------------------------------------------

/**
 * Write an elevation prefill into a view's calibration.
 *
 * `onlyIfEmpty` (the attach-time default) is the promise that autofill never
 * touches hand-clicked work: if the user has already set the scale or the
 * floor line, nothing here moves. The Calibrate step's explicit "use the
 * printed sheet" button passes onlyIfEmpty: false, because then the user asked.
 *
 * Returns the list of fields actually written.
 */
export function applyElevationPrefill(view, result, { onlyIfEmpty = true } = {}) {
  const written = [];
  if (!view || !result || result.status !== 'used') return written;
  if (!result.floorLine || !result.scaleLine) return written;
  const c = view.calib;
  const hasScale = !!(c.scale.a && c.scale.b);
  const hasFloor = !!(c.floor.a && c.floor.b);
  if (onlyIfEmpty && (hasScale || hasFloor)) return written;

  c.scale.a = { ...result.scaleLine.a };
  c.scale.b = { ...result.scaleLine.b };
  c.scale.value = result.scaleLine.valueMm;
  c.scale.unit = 'mm';
  c.floor.a = { ...result.floorLine.a };
  c.floor.b = { ...result.floorLine.b };
  written.push('scale', 'floor');
  return written;
}

/**
 * The top view's prefill is just the 4 paper corners; the caller routes them
 * through calibrate.js's existing quad-change path so pxPerUnit, the re-warp
 * and the landmark remap all happen exactly as they do for clicked corners.
 */
export function topPrefillCorners(result, view, { onlyIfEmpty = true } = {}) {
  if (!result || result.status !== 'used' || !result.rectifyCorners) return null;
  if (onlyIfEmpty && view && view.calib.paper.corners.length === 4) return null;
  return { kind: result.variant, corners: result.rectifyCorners.map((p) => ({ ...p })) };
}

// ---------------------------------------------------------------------------
// Photo intake — the rules every attach path has to follow
// ---------------------------------------------------------------------------

/**
 * Every createImageBitmap in this app passes `imageOrientation: 'from-image'`.
 *
 * Without it Chrome and Firefox ignore the EXIF orientation tag and an iPhone
 * photo (almost always orientation 6, "rotate 90° CW") comes in on its side —
 * which silently ruins the floor line, the scale, and every landmark. Safari
 * applies EXIF by default, so this is a bug that only appears on some
 * machines, which is the worst kind. app/test.mjs asserts the option is on
 * every call site in this file and in steps.js.
 */
export const BITMAP_OPTIONS = Object.freeze({ imageOrientation: 'from-image' });

const HEIC_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1',
]);

/** Format sniff from the first bytes: 'jpeg' | 'png' | 'heic' | 'avif' | null. */
export function sniffImageFormat(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  const str = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (str(4, 4) === 'ftyp') {
    const brand = str(8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIC_BRANDS.has(brand)) return 'heic';
  }
  return null;
}

/**
 * EXIF orientation (1–8) declared by a JPEG, or null.
 *
 * Read for reporting only — the browser is the thing that applies it, via
 * BITMAP_OPTIONS. Knowing the number lets the UI say "this photo was rotated"
 * instead of leaving the user to wonder, and lets the tests prove a synthetic
 * orientation-6 file really does declare 6.
 */
export function readExifOrientation(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return null; // image data starts
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    const seg = i + 4;
    const end = Math.min(bytes.length, seg + len - 2);
    if (marker === 0xe1 && end - seg > 8
      && String.fromCharCode(...bytes.subarray(seg, seg + 4)) === 'Exif') {
      return readTiffOrientation(bytes.subarray(seg + 6, end));
    }
    i = seg + len - 2;
  }
  return null;
}

function readTiffOrientation(t) {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  const be = t[0] === 0x4d && t[1] === 0x4d;
  if (!le && !be) return null;
  const u16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o) => (le
    ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0
    : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > t.length) return null;
  const count = u16(ifd);
  for (let e = 0; e < count; e += 1) {
    const off = ifd + 2 + e * 12;
    if (off + 12 > t.length) return null;
    if (u16(off) === 0x0112) {
      const value = u16(off + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A decode failure the UI can act on. `kind` picks the copy. */
export class PhotoError extends Error {
  constructor(kind, name, message, fix) {
    super(message);
    this.name = 'PhotoError';
    this.kind = kind;
    this.fileName = name;
    this.fix = fix;
  }
}

/**
 * HEIC: no decoder is vendored, and the error says exactly how to fix it.
 *
 * DECISION (phase 3b, and the reasoning is here so it can be revisited rather
 * than re-litigated): the only production-grade HEIC decoders that build to
 * WASM are libheif + libde265 / libx265, all LGPL-3.0. The apriltag precedent
 * in marker/vendor/ is BSD-3 — a permissive blob that can simply be copied in
 * with its LICENSE and a sha256. An LGPL blob carries a relinking obligation
 * that a static, no-build, zero-dependency site cannot honour cleanly, and no
 * permissively-licensed single-file HEIC build exists to vendor instead. So
 * per ANNOTATOR.md's own fallback clause we detect the format and fail LOUDLY
 * with the exact fix, rather than ship a legal question mark or a silent
 * failure. Safari and iOS decode HEIC natively, so this only bites Chrome and
 * Firefox users, and re-exporting as JPEG keeps the EXIF the app needs.
 */
export function describeDecodeFailure(fileName, bytes, cause) {
  const format = sniffImageFormat(bytes);
  const name = fileName || 'that photo';
  if (format === 'heic') {
    return new PhotoError('heic', name,
      `“${name}” is an Apple HEIC photo, and this browser cannot decode it.`,
      'Fix it in one of three ways: open the file in Preview on a Mac and File → Export as JPEG; '
      + 'or on the iPhone set Settings → Camera → Formats → Most Compatible and re-shoot; '
      + 'or AirDrop/share the photo as JPEG. Safari can open HEIC directly if you have it. '
      + 'A JPEG export keeps the EXIF the app needs, so nothing is lost.');
  }
  if (format === 'avif') {
    return new PhotoError('avif', name,
      `“${name}” is an AVIF image and this browser cannot decode it.`,
      'Export or convert it to JPEG or PNG and attach that instead.');
  }
  return new PhotoError('decode', name,
    `“${name}” could not be decoded${cause ? ` — ${cause}` : ''}.`,
    'Try re-exporting it as a JPEG or PNG. If the file opens in Preview but not here, it is '
    + 'almost always an unusual colour profile or a truncated download.');
}

/**
 * File -> {bitmap, width, height, name, format, exifOrientation}.
 *
 * `deps` exists so the node tests drive the identical code path with a stub
 * bitmap factory: there is no createImageBitmap outside a browser, and the
 * point of the test is the CONTRACT (from-image, HEIC named, no double
 * rotation), not the browser's JPEG decoder.
 */
export async function decodePhoto(file, deps = {}) {
  const createBitmap = deps.createBitmap
    || ((blob) => globalThis.createImageBitmap(blob, BITMAP_OPTIONS));
  const headBytes = deps.headBytes || 65536;
  const name = (file && file.name) || 'photo';

  let head = deps.head || null;
  if (!head && file && typeof file.slice === 'function') {
    try {
      head = new Uint8Array(await file.slice(0, headBytes).arrayBuffer());
    } catch (err) {
      head = null;
    }
  }

  let bitmap;
  try {
    bitmap = await createBitmap(file, BITMAP_OPTIONS);
  } catch (err) {
    throw describeDecodeFailure(name, head, err && err.message);
  }
  if (!bitmap || !(bitmap.width > 0) || !(bitmap.height > 0)) {
    throw describeDecodeFailure(name, head, 'the decoder returned an empty image');
  }
  return {
    bitmap,
    // the browser has already applied the EXIF rotation, so these are the
    // upright dimensions — never rotate them again downstream
    width: bitmap.width,
    height: bitmap.height,
    name,
    format: sniffImageFormat(head),
    exifOrientation: readExifOrientation(head),
  };
}

// ---------------------------------------------------------------------------

function round4(v) { return Math.round(v * 1e4) / 1e4; }
