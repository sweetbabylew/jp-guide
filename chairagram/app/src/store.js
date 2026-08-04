// store.js — the one serialisable state object, autosave, project export/import.
//
// PURE. No DOM, no Date, no random. `localStorage` is passed in, so test.mjs
// drives the same code path with a plain object.
//
// Quota safety: the autosaved copy NEVER contains image data. Photos live in a
// runtime map owned by the UI; only an explicit "export with photos" embeds
// downscaled data URLs, and only under a hard byte cap.
//
// It reaches UP to solve.js for one thing only: the field registry, which is
// the sole place that knows whether a pinned number is a length, an angle or a
// count. A units conversion has to know — converting `sticks.count` or a rake
// angle by 25.4 would be far worse than the bug it fixes.

import { FIELD_BY_KEY } from './solve.js';

/**
 * 2 adds the phase-3b fields (marker calibration per view, the two topology
 * questions, the typed ruler measurement). 3 gives every landmark a `source`,
 * so a position the TEMPLATE put there can never be counted as something the
 * user measured. Older projects load straight in — see `migrateProject` — and
 * the STORAGE KEY DELIBERATELY DOES NOT MOVE: there are live autosaves in the
 * field, and a new key would silently throw them away.
 */
export const PROJECT_VERSION = 3;
export const STORAGE_KEY = 'chairagram.annotator.project.v1';
export const EXPORT_FORMAT = 'chairagram-project';

/** Long-side pixels and JPEG quality for embedded copies (export only). */
export const EMBED_MAX_PX = 1400;
export const EMBED_QUALITY = 0.72;
/** Hard cap on the total embedded payload; over this, photos are left out. */
export const EMBED_TOTAL_CAP_BYTES = 6 * 1024 * 1024;

export const VIEW_IDS = ['front', 'side', 'top'];
export const TEMPLATE_IDS = ['jp-armchair', 'jp-bench', 'blank-combback'];

/* ---------------------------------------------------------------------------
 * PHASE-3b PROJECT FIELDS — the contract with the workstream that consumes them
 * ---------------------------------------------------------------------------
 * These are answers and measurements, never derived values. Nothing in this
 * file acts on them; the solver, the schedule and the trust banners do.
 *
 *   project.armStyle          null | 'none' | 'armbow'
 *       null means UNANSWERED — the template's own fact stands, and the trust
 *       surface must say so. 'none' and 'armbow' OVERRIDE the template.
 *   project.armSpindleCount   integer | null
 *       Sticks between the seat and the arm bow. Only meaningful with
 *       'armbow'; null when unanswered.
 *   project.crestTenons       null | 'through' | 'blind'
 *       Maps onto the spec's `sticks.throughCrest`: 'through' -> true,
 *       'blind' -> false, null -> leave the template's value alone.
 *   project.ruler             { value: number|null, unit: 'mm' | 'in' }
 *       What the user measured on the printed sheet's verification bar:
 *       unit 'mm' means they measured the 100 mm bar, 'in' the 4 in bar.
 *       markercal.rulerScale() turns it into the print-scale factor k, which
 *       overrides the print-perfect assumption and is the live "scale check"
 *       percentage. value null = print-perfect assumed.
 *   project.views[id].markerCal
 *       markercal.emptyResult()'s shape — see that file for every field.
 *       status 'used' means a prefill was derived from the printed sheet;
 *       'rejected' means a sheet was found and NOT trusted (reason says why);
 *       'none' means no sheet in the photo. Calibration itself still lives in
 *       calib.scale / calib.floor / calib.paper exactly as it did in phase 2 —
 *       markerCal is provenance, not a second source of truth.
 *   project.stickCountAnswered  boolean
 *       Whether the user actually set the back-stick count, as opposed to
 *       inheriting the template's. `stickCount` itself has no "unanswered"
 *       value — a project always has a number — so this flag is what the other
 *       answers get from being nullable, and it is what stops the app badging
 *       the template's own count as something the user told it.
 *   project.views[id].landmarks  { id: { x, y, source } }
 *       `source` is PROVENANCE, not a second source of truth (same idea as
 *       markerCal and stickCountAnswered): 'clicked' means the user put that
 *       point there, 'seeded' means the template did and the user has left it
 *       alone. See LANDMARK_SOURCES below for the whole rule.
 *   project.views[id].traces  { comb?, armbow?, seatOutline?: [{x, y}, …] }
 *       Curve traces (SPEC.md v0.2's planar sampled curves), in the view's own
 *       working pixel space — the top view's is the RECTIFIED canvas, the same
 *       space every top landmark is clicked in. Stored EXACTLY AS TRACED: SPEC
 *       forbids resampling on load, so nothing here (or in the solver) smooths
 *       or resamples them; solve.js converts the points to chair-frame
 *       [[x, z], …] pairs and the renderer smooths at draw time. An absent or
 *       short trace means "not traced" — the curve stays template and the trust
 *       banner says so. Still project version 2: a v2 project written before
 *       tracing existed has no traces, which is exactly what that means.
 * ------------------------------------------------------------------------- */

const num = (v, fallback = null) => (Number.isFinite(v) ? v : fallback);

function point(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}

function points4(arr) {
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  const out = arr.map(point);
  return out.every(Boolean) ? out : null;
}

function matrix9(arr) {
  if (!Array.isArray(arr) || arr.length !== 9) return null;
  return arr.every((v) => Number.isFinite(v)) ? arr.map(Number) : null;
}

function segment(seg, extra) {
  if (!seg) return null;
  const a = point(seg.a);
  const b = point(seg.b);
  if (!a || !b) return null;
  const out = { a, b };
  if (extra) {
    const v = num(seg[extra]);
    if (v === null) return null;
    out[extra] = v;
  }
  return out;
}

const MARKER_STATUS = ['none', 'used', 'rejected'];

// ---------------------------------------------------------------------------
// Landmark provenance
// ---------------------------------------------------------------------------
//
// The Landmarks step pre-places every point where the TEMPLATE expects it, and
// "Accept all template positions" writes the whole lot in one press. Those are
// coordinates the template chose, not the chair — but they used to be stored as
// bare {x, y}, indistinguishable from a click, so the solver measured them and
// the trust banner counted them as coming from the user's own photos. That is
// exactly the lie DECISIONS D10 exists to stop, and the hint under the button
// ("it is not a measurement") was being contradicted by the count next to it.
//
// So a landmark carries where it came from:
//
//   'clicked'  the user placed, dragged or nudged it. A measurement.
//   'seeded'   the template put it there and the user has left it alone. It
//              still counts as PLACED (the schedule's progress is about having
//              a point to work from), it still feeds the solver so a half-done
//              session renders a whole chair — but nothing derived from it may
//              be called measured.
//
// One touch upgrades 'seeded' to 'clicked' and there is no way back short of
// clearing the view: adjusting a template position IS the template-deform
// gesture D3 is built on, and the adjusted point is the user's.

/** The two things a landmark's `source` can be. */
export const LANDMARK_SOURCES = ['clicked', 'seeded'];

/**
 * One landmark, junk dropped. Key order is fixed ({x, y, source}) so the
 * export -> import -> deep-equal round trip holds byte for byte.
 *
 * A point that arrives with no source at all is read as 'clicked'. The one
 * thing inside the app that produces one is calibrate.js's re-warp carry, which
 * rewrites the COORDINATES of landmarks that already exist (it cannot invent
 * one), and steps.js remembers what they were across that carry — see
 * `restoreLandmarkSources`.
 */
function landmark(p) {
  const q = point(p);
  if (!q) return null;
  q.source = p.source === 'seeded' ? 'seeded' : 'clicked';
  return q;
}

/**
 * Give back any landmark provenance that a coordinate remap dropped, and
 * report what every landmark's provenance now is so the next remap can be
 * survived too.
 *
 * `remembered` is this function's own previous return value, keyed
 * { viewId: { landmarkId: source } }. Anything the caller has never seen before
 * is left to `landmark()`'s default.
 *
 * This exists because a landmark's coordinates get rewritten in places that
 * have no business thinking about trust — re-warping the top view's paper quad
 * moves every top landmark through a new homography — and provenance that
 * survives only the code paths that remember to carry it is provenance that
 * will be wrong one day.
 */
export function restoreLandmarkSources(project, remembered = {}) {
  const now = {};
  for (const id of VIEW_IDS) {
    const view = (project.views && project.views[id]) || {};
    const previous = remembered[id] || {};
    const seen = {};
    for (const [key, p] of Object.entries(view.landmarks || {})) {
      if (!p || typeof p !== 'object') continue;
      if (!LANDMARK_SOURCES.includes(p.source)) {
        p.source = previous[key] === 'seeded' ? 'seeded' : 'clicked';
      }
      seen[key] = p.source;
    }
    now[id] = seen;
  }
  return now;
}

/** The curves a view can carry. Fixed order = deterministic serialisation. */
export const TRACE_IDS = ['comb', 'armbow', 'seatOutline'];

/** Traced polylines, junk dropped. Points are kept in traced order, untouched. */
function traces(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of TRACE_IDS) {
    if (!Array.isArray(raw[id])) continue;
    const pts = raw[id].map(point).filter(Boolean);
    if (pts.length) out[id] = pts;
  }
  return out;
}

/** Canonical marker-calibration record. Mirrors markercal.emptyResult(). */
function markerCal(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  return {
    status: MARKER_STATUS.includes(m.status) ? m.status : 'none',
    variant: m.variant === 'letter' || m.variant === 'a4' ? m.variant : null,
    found: Number.isFinite(m.found) ? Math.max(0, Math.round(m.found)) : 0,
    residualPx: num(m.residualPx),
    residualMm: num(m.residualMm),
    jkScalePct: num(m.jkScalePct),
    jkPointPx: num(m.jkPointPx),
    scalePxPerMm: num(m.scalePxPerMm) !== null && m.scalePxPerMm > 0 ? m.scalePxPerMm : null,
    floorLine: segment(m.floorLine),
    scaleLine: segment(m.scaleLine, 'valueMm'),
    rectifyCorners: points4(m.rectifyCorners),
    sheetH: matrix9(m.sheetH),
    reason: typeof m.reason === 'string' && m.reason ? m.reason : null,
  };
}

function sortedMap(obj, valueOf) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const key of Object.keys(obj).sort()) {
    const v = valueOf(obj[key]);
    if (v !== null && v !== undefined) out[key] = v;
  }
  return out;
}

export function emptyView(id) {
  return {
    id,
    present: false,
    imageName: null,
    imageWidth: 0,
    imageHeight: 0,
    rectWidth: 0,
    rectHeight: 0,
    calib: {
      scale: { a: null, b: null, value: null, unit: 'in' },
      floor: { a: null, b: null },
      paper: { kind: 'letter', corners: [], swap: false, pxPerUnit: 48 },
    },
    markerCal: markerCal(null),
    landmarks: {},
    traces: {},
  };
}

export function createProject(overrides = {}) {
  const base = {
    version: PROJECT_VERSION,
    format: EXPORT_FORMAT,
    name: '',
    notes: '',
    template: 'jp-armchair',
    units: 'in',
    stickCount: 6,
    stickCountAnswered: false,
    armStyle: null,
    armSpindleCount: null,
    crestTenons: null,
    ruler: { value: null, unit: 'mm' },
    views: {
      front: emptyView('front'),
      side: emptyView('side'),
      top: emptyView('top'),
    },
    pins: {},
    choices: {},
  };
  return normalizeProject({ ...base, ...overrides });
}

/**
 * Bring an older project's SHAPE up to date. Value-level defaults are the job
 * of normalizeProject below; this is only for changes it cannot express.
 *
 * v1 -> v2 (phase 3b): purely additive — markerCal per view, armStyle,
 * armSpindleCount, crestTenons, ruler. Every one of them defaults to "not
 * answered / not detected", which is exactly what a v1 project means, so the
 * migration is a version stamp and nothing else. Written out anyway so the
 * next shape change has somewhere obvious to go.
 *
 * v2 -> v3: landmarks gain `source`, and every landmark in an older project is
 * stamped 'clicked'. That is a judgement, so here is the reasoning. Seeding
 * existed in v2 (the ghosts, and the "accept all" button), so a handful of
 * those old points really were the template's. But the overwhelming majority of
 * a v2 project's landmarks are field work — clicked one at a time on a real
 * chair — and the alternative default would brand ALL of it untrusted, wiping
 * out a measured drawing's count on load. Marking a few template positions as
 * clicked understates nothing the user can see; marking a whole day's clicking
 * as template would be the bigger lie, and the louder one.
 */
export function migrateProject(raw) {
  const r = raw && typeof raw === 'object' ? { ...raw } : {};
  const from = Number.isFinite(r.version) ? r.version : 1;
  if (from < 2) {
    // Nothing to rename or move. The unanswered questions stay unanswered:
    // inventing 'armbow' here would be the template impersonating an answer.
    r.version = 2;
  }
  if (from < 3) {
    const views = {};
    for (const [id, v] of Object.entries(r.views || {})) {
      if (!v || typeof v !== 'object' || !v.landmarks || typeof v.landmarks !== 'object') {
        views[id] = v;
        continue;
      }
      const lm = {};
      for (const [key, p] of Object.entries(v.landmarks)) {
        if (!p || typeof p !== 'object') continue;
        lm[key] = { ...p, source: p.source === 'seeded' ? 'seeded' : 'clicked' };
      }
      views[id] = { ...v, landmarks: lm };
    }
    r.views = views;
    r.version = 3;
  }
  return r;
}

/**
 * Canonical form: every key present, in a fixed order, junk dropped. Import,
 * export and autosave all funnel through this, which is what makes
 * export -> import -> deep-equal hold.
 */
export function normalizeProject(rawInput) {
  const r = migrateProject(rawInput);
  const units = r.units === 'mm' ? 'mm' : 'in';
  const template = TEMPLATE_IDS.includes(r.template) ? r.template : 'jp-armchair';
  const stickCount = Number.isFinite(r.stickCount)
    ? Math.max(2, Math.round(r.stickCount)) : 6;

  const views = {};
  for (const id of VIEW_IDS) {
    const v = (r.views && r.views[id]) || {};
    const calib = v.calib || {};
    const scale = calib.scale || {};
    const floor = calib.floor || {};
    const paper = calib.paper || {};
    const corners = Array.isArray(paper.corners)
      ? paper.corners.map(point).filter(Boolean).slice(0, 4) : [];
    views[id] = {
      id,
      present: Boolean(v.present),
      imageName: typeof v.imageName === 'string' && v.imageName ? v.imageName : null,
      imageWidth: num(v.imageWidth, 0),
      imageHeight: num(v.imageHeight, 0),
      rectWidth: num(v.rectWidth, 0),
      rectHeight: num(v.rectHeight, 0),
      calib: {
        scale: {
          a: point(scale.a),
          b: point(scale.b),
          value: Number.isFinite(scale.value) && scale.value > 0 ? scale.value : null,
          unit: scale.unit === 'mm' ? 'mm' : 'in',
        },
        floor: { a: point(floor.a), b: point(floor.b) },
        paper: {
          kind: paper.kind === 'a4' ? 'a4' : 'letter',
          corners,
          swap: Boolean(paper.swap),
          pxPerUnit: Number.isFinite(paper.pxPerUnit) && paper.pxPerUnit > 0
            ? paper.pxPerUnit : 48,
        },
      },
      markerCal: markerCal(v.markerCal),
      landmarks: sortedMap(v.landmarks, landmark),
      traces: traces(v.traces),
    };
  }

  const armStyle = r.armStyle === 'none' || r.armStyle === 'armbow' ? r.armStyle : null;
  const spindles = Number.isFinite(r.armSpindleCount)
    ? Math.max(0, Math.round(r.armSpindleCount)) : null;
  const crestTenons = r.crestTenons === 'through' || r.crestTenons === 'blind'
    ? r.crestTenons : null;
  const rawRuler = (r.ruler && typeof r.ruler === 'object') ? r.ruler : {};

  return {
    version: PROJECT_VERSION,
    format: EXPORT_FORMAT,
    name: typeof r.name === 'string' ? r.name : '',
    notes: typeof r.notes === 'string' ? r.notes : '',
    template,
    units,
    stickCount,
    stickCountAnswered: Boolean(r.stickCountAnswered),
    armStyle,
    armSpindleCount: armStyle === 'none' ? null : spindles,
    crestTenons,
    ruler: {
      value: Number.isFinite(rawRuler.value) && rawRuler.value > 0 ? rawRuler.value : null,
      unit: rawRuler.unit === 'in' ? 'in' : 'mm',
    },
    views,
    pins: sortedMap(r.pins, (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null)),
    choices: sortedMap(r.choices, (v) => (typeof v === 'string' && v ? v : null)),
  };
}

// ---------------------------------------------------------------------------
// Changing the project's units
// ---------------------------------------------------------------------------
//
// `project.units` is not a display preference. It is the unit that every
// unit-bearing number in the project is expressed IN, and swapping the flag
// without converting them relabels the whole project — a pinned 17 in becomes
// "17 mm" without moving, and every top-view number changes by a factor of 25.4
// without a pixel moving. Both were live bugs.
//
// Two fields in the whole store are unit-bearing, and this converts both
// atomically so the project is never half in one unit and half in the other:
//
//   project.pins             bare numbers, read in project units. Only the
//                            LENGTH pins convert — an angle is degrees in any
//                            unit, and a count is a count.
//   views[*].calib.paper
//        .pxPerUnit          rectified pixels per PROJECT UNIT. Rescaling it by
//                            the inverse factor leaves the rectified canvas the
//                            exact same size in pixels (its width is
//                            paperWidthInUnits × pxPerUnit, and both sides move
//                            oppositely), so every stored rectified-px landmark
//                            and trace point stays exactly where it was and
//                            keeps meaning exactly what it meant.
//
// Everything else is already safe and stays untouched: the per-view scale bar
// carries its own unit (`calib.scale.unit`), so does the typed ruler; landmarks,
// traces, floor lines and paper corners are pixels; markerCal is millimetres
// and pixels by construction. The template is re-derived by the caller.

/** Millimetres in an inch. The only conversion factor this app has. */
export const MM_PER_IN = 25.4;

/** How many `to` units make one `from` unit. */
export function unitFactor(from, to) {
  if (from === to) return 1;
  return to === 'mm' ? MM_PER_IN : 1 / MM_PER_IN;
}

/**
 * Round a converted length to a number a person could have typed: thousandths
 * of a millimetre, ten-thousandths of an inch. Both are far finer than anything
 * a chairmaker reads off a rule (a micron; a quarter of a thou) and far coarser
 * than float noise, so a value survives any number of unit flips unchanged:
 * 17 in → 431.8 mm → 17 in, and 15/16 in → 23.813 mm → 0.9375 in, exactly and
 * forever. Rounding millimetres to hundredths instead loses the sixteenths —
 * 0.9375 came back 0.9374, which the Spec table would have shown.
 */
function roundLength(v, units) {
  const f = units === 'mm' ? 1e3 : 1e4;
  return Math.round(v * f) / f;
}

/**
 * pxPerUnit is a derived scale, not something anyone typed, so it is snapped to
 * 12 significant figures instead. That is ~1 part in 10^12 (nothing, next to a
 * 1400 px canvas) and it makes repeated toggling settle on a fixed point rather
 * than drifting in the last bits.
 */
function snapScale(v) {
  return Number(v.toPrecision(12));
}

/**
 * Move the whole project into `toUnits`. Mutates and returns it.
 * A no-op when the units already match, so it is safe to call on every change.
 */
export function convertProjectUnits(project, toUnits) {
  const to = toUnits === 'mm' ? 'mm' : 'in';
  const from = project.units === 'mm' ? 'mm' : 'in';
  if (from === to) return project;
  const factor = unitFactor(from, to);

  project.units = to;

  const pins = {};
  for (const [key, raw] of Object.entries(project.pins || {})) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const field = FIELD_BY_KEY[key];
    // An unknown pin key writes to nothing (assembleSpec skips it), so leaving
    // it alone is both harmless and the honest answer: we do not know what it
    // measures.
    pins[key] = field && field.kind === 'length' ? roundLength(v * factor, to) : v;
  }
  project.pins = pins;

  for (const id of VIEW_IDS) {
    const paper = project.views[id] && project.views[id].calib && project.views[id].calib.paper;
    if (!paper || !(paper.pxPerUnit > 0)) continue;
    paper.pxPerUnit = snapScale(paper.pxPerUnit / factor);
  }
  return project;
}

// ---------------------------------------------------------------------------
// Attaching a photo over an existing one
// ---------------------------------------------------------------------------
//
// Every click on a view — the scale bar, the floor line, the paper quad, the
// landmarks, the traces — is a coordinate in THAT PHOTO's pixel space. Attach a
// different photo and they are all still there, still badged "measured", now
// pointing at whatever happens to be under those pixels in the new frame. The
// traced-outline datum makes it worse than cosmetic: a stale top trace moves
// the seat's z origin, which moves the mortises, the stick row and the depth.
//
// So the rule is: the clicks survive a RE-ATTACH and nothing else. A re-attach
// is the documented flow after a reload (photos are never stored, so the user
// picks the same file again), and it is recognisable — same file name, same
// pixel dimensions. Anything else is a new photo and starts clean.

/** Is this the same photo that is already attached to the view? */
export function isSamePhoto(view, photo) {
  if (!view || !view.present || !view.imageName || !photo || !photo.name) return false;
  return view.imageName === photo.name
    && Number(view.imageWidth) === Number(photo.width)
    && Number(view.imageHeight) === Number(photo.height);
}

/** Has anything been calibrated on this view yet? */
function hasCalibration(view) {
  const c = (view && view.calib) || {};
  const s = c.scale || {};
  const f = c.floor || {};
  const p = c.paper || {};
  return Boolean(s.a || s.b || Number.isFinite(s.value) || f.a || f.b
    || (Array.isArray(p.corners) && p.corners.length));
}

/**
 * Drop everything on a view that belonged to the photo being replaced, and
 * report what went, so the UI can say so instead of silently losing work.
 *
 * The user's own SETTINGS survive — which unit they type in, which paper they
 * printed — because those are facts about the person, not about the photo.
 * `markerCal` is reset by the caller (it is re-detected on every attach).
 */
export function clearViewWork(view) {
  const cleared = {
    calibration: hasCalibration(view),
    landmarks: Object.keys(view.landmarks || {}).length,
    traces: Object.keys(view.traces || {}).length,
  };
  const fresh = emptyView(view.id);
  fresh.calib.scale.unit = ((view.calib || {}).scale || {}).unit === 'mm' ? 'mm' : 'in';
  fresh.calib.paper.kind = ((view.calib || {}).paper || {}).kind === 'a4' ? 'a4' : 'letter';
  view.calib = fresh.calib;
  view.landmarks = {};
  view.traces = {};
  view.rectWidth = 0;
  view.rectHeight = 0;
  cleared.any = cleared.calibration || cleared.landmarks > 0 || cleared.traces > 0;
  return cleared;
}

/** A JSON-safe deep copy in canonical form. Never contains image data. */
export function serializeProject(project) {
  return normalizeProject(JSON.parse(JSON.stringify(project)));
}

export function cloneProject(project) {
  return serializeProject(project);
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/**
 * Which embedded photos fit under the cap, largest-last so the most useful
 * views survive. `embeds` is { viewId: { name, dataUrl } }.
 */
export function planEmbeds(embeds, cap = EMBED_TOTAL_CAP_BYTES) {
  const kept = {};
  const dropped = [];
  let total = 0;
  for (const id of VIEW_IDS) {
    const e = embeds && embeds[id];
    if (!e || typeof e.dataUrl !== 'string' || !e.dataUrl) continue;
    const size = e.dataUrl.length;
    if (total + size > cap) { dropped.push(id); continue; }
    total += size;
    kept[id] = { name: e.name || null, dataUrl: e.dataUrl };
  }
  return { kept, dropped, bytes: total };
}

/**
 * exportProject(project, embeds?) -> plain object ready for JSON.stringify.
 * With no embeds the photos are referenced by file name only and the importer
 * asks the user to re-attach them.
 */
export function exportProject(project, embeds = null, cap = EMBED_TOTAL_CAP_BYTES) {
  const p = serializeProject(project);
  const payload = {
    format: EXPORT_FORMAT,
    version: PROJECT_VERSION,
    project: p,
  };
  const warnings = [];
  if (embeds) {
    const { kept, dropped, bytes } = planEmbeds(embeds, cap);
    if (Object.keys(kept).length) payload.images = kept;
    if (dropped.length) {
      warnings.push(`Photos left out to stay under the ${Math.round(cap / 1e6)} MB export cap: ${dropped.join(', ')}. The project still carries their file names.`);
    }
    payload.imageBytes = bytes;
  }
  return { payload, warnings };
}

/** importProject(payload) -> { project, images, warnings }. Throws on garbage. */
export function importProject(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('That file is not a chairagram project (expected a JSON object).');
  }
  const raw = payload.project ? payload.project : payload;
  if (!raw || typeof raw !== 'object' || !raw.views) {
    throw new Error('That file is not a chairagram project (no views were found).');
  }
  const warnings = [];
  if (payload.version && payload.version > PROJECT_VERSION) {
    warnings.push(`This project was saved by a newer version (${payload.version}); unknown fields were dropped.`);
  }
  const project = normalizeProject(raw);
  const images = {};
  if (payload.images && typeof payload.images === 'object') {
    for (const id of VIEW_IDS) {
      const e = payload.images[id];
      if (e && typeof e.dataUrl === 'string' && e.dataUrl.startsWith('data:image/')) {
        images[id] = { name: e.name || project.views[id].imageName, dataUrl: e.dataUrl };
      }
    }
  }
  for (const id of VIEW_IDS) {
    if (project.views[id].present && !images[id]) {
      warnings.push(`The ${id} photo is referenced as "${project.views[id].imageName || 'unnamed'}" but not embedded — re-attach it on the Photos step.`);
    }
  }
  return { project, images, warnings };
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

/** saveLocal -> true on success, false when storage is full or unavailable. */
export function saveLocal(project, storage) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(serializeProject(project)));
    return true;
  } catch (err) {
    return false;
  }
}

/** loadLocal -> project or null. Never throws. */
export function loadLocal(storage) {
  if (!storage) return null;
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
  }
  if (!raw) return null;
  try {
    return normalizeProject(JSON.parse(raw));
  } catch (err) {
    return null;
  }
}

export function clearLocal(storage) {
  if (!storage) return;
  try { storage.removeItem(STORAGE_KEY); } catch (err) { /* nothing to do */ }
}

/** A filesystem-safe base name for downloads. Deterministic (no timestamps). */
export function projectSlug(project) {
  const raw = (project.name || project.template || 'chair').toString();
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'chair';
}
