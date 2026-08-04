// landmarks.js — the landmark schedule, template seeding, and the pure part of
// the placement/selection/nudge machine.
//
// PURE. No DOM, no Date, no random. steps.js does the rendering and the event
// wiring; every decision about *what* a landmark is and *where* it starts
// lives here so test.mjs can check it under node.
//
// The per-view floor pair from ANNOTATOR.md's schedule table is collected in
// the Calibrate step (step 2 owns "two clicks along the floor"), so it is not
// repeated here; the schedule surfaces it as a read-only prerequisite row.

import {
  forwardGeometry, elevationCalibration, topCalibration,
  resolveArmStyle, tracePointsOf, TRACE_MIN, TRACE_MAX,
} from './solve.js';
import {
  samplePlanCurve, fitCircle, fitToleranceFor, arcLength, chordLength,
} from '../../renderer/src/curve.js';

export const GROUPS = {
  seat: { label: 'Seat', color: '#33628f' },
  legs: { label: 'Legs', color: '#b4622a' },
  sticks: { label: 'Sticks', color: '#2f7d5a' },
  crest: { label: 'Crest', color: '#7a4fa3' },
  arms: { label: 'Arms', color: '#a8862c' },
};

export const VIEW_LABEL = { front: 'Front', side: 'Side', top: 'Top (rectified)' };

const F = (id, group, prompt, extra = {}) => ({ id: `front.${id}`, view: 'front', group, prompt, ...extra });
const S = (id, group, prompt, extra = {}) => ({ id: `side.${id}`, view: 'side', group, prompt, ...extra });
const T = (id, group, prompt, extra = {}) => ({ id: `top.${id}`, view: 'top', group, prompt, ...extra });

/**
 * The full schedule, before filtering for the template and the uploaded views.
 * `optional: true` means the field it feeds is a cross-check, not a spec value.
 */
export function fullSchedule() {
  return [
    F('seatTopLeft', 'seat', 'Click the LEFT end of the seat’s top front edge.', { feeds: 'seat.width' }),
    F('seatTopRight', 'seat', 'Click the RIGHT end of the seat’s top front edge.', { feeds: 'seat.width' }),
    F('crestLeft', 'crest', 'Click the LEFT end of the crest.', { feeds: 'crest.length' }),
    F('crestRight', 'crest', 'Click the RIGHT end of the crest.', { feeds: 'crest.length' }),
    F('stickSeatLeft', 'sticks', 'Click the centre of the LEFTMOST stick where it leaves the seat.', { feeds: 'sticks.spread' }),
    F('stickSeatRight', 'sticks', 'Click the centre of the RIGHTMOST stick where it leaves the seat.', { feeds: 'sticks.spread' }),
    F('stickCrestLeft', 'sticks', 'Click the centre of the LEFTMOST stick where it meets the crest.', { optional: true, feeds: 'check.stickSpreadAtCrest' }),
    F('stickCrestRight', 'sticks', 'Click the centre of the RIGHTMOST stick where it meets the crest.', { optional: true, feeds: 'check.stickSpreadAtCrest' }),
    F('armInsideLeft', 'arms', 'Click the INSIDE face of the LEFT arm.', { optional: true, needsFullArms: true, feeds: 'check.armsInside' }),
    F('armInsideRight', 'arms', 'Click the INSIDE face of the RIGHT arm.', { optional: true, needsFullArms: true, feeds: 'check.armsInside' }),

    S('seatFrontTop', 'seat', 'Click the seat’s TOP FRONT corner.', { feeds: 'seat.heightFront' }),
    S('seatBackTop', 'seat', 'Click the seat’s TOP BACK corner.', { feeds: 'seat.heightBack, seat.depth' }),
    S('seatFrontBottom', 'seat', 'Click the seat’s BOTTOM FRONT corner, straight below the last one.', { feeds: 'seat.thickness' }),
    S('frontLegFoot', 'legs', 'Click the centre of the FRONT foot where it meets the floor.', { feeds: 'legs.front.rake' }),
    S('frontLegSeat', 'legs', 'Click the centre of the FRONT leg where it enters the seat top.', { feeds: 'legs.front.rake' }),
    S('backLegFoot', 'legs', 'Click the centre of the BACK foot where it meets the floor.', { feeds: 'legs.back.rake' }),
    S('backLegSeat', 'legs', 'Click the centre of the BACK leg where it enters the seat top.', { feeds: 'legs.back.rake' }),
    S('stickBase', 'sticks', 'Click the centre of the outer back stick where it leaves the seat.', { feeds: 'sticks.lean' }),
    S('stickTip', 'sticks', 'Click the centre of that SAME stick at its very top.', { feeds: 'sticks.lean' }),
    S('crestBottom', 'crest', 'Click where the stick meets the BOTTOM face of the crest.', { feeds: 'crest.bottomAboveSeat' }),
    S('crestTop', 'crest', 'Click where that stick line crosses the TOP face of the crest.', { feeds: 'crest.height' }),
    S('armTop', 'arms', 'Click the TOP of the arm, level with the seat’s front edge.', { needsArms: true, notForBow: true, feeds: 'arms.aboveSeat' }),
    S('bowTop', 'arms', 'Click the TOP of the arm bow at its deepest point — the apex, behind the sitter.', { needsBow: true, feeds: 'arms.aboveSeat' }),

    T('seatFrontLeft', 'seat', 'Click the seat’s FRONT-LEFT corner.', { feeds: 'seat.width' }),
    T('seatFrontRight', 'seat', 'Click the seat’s FRONT-RIGHT corner.', { feeds: 'seat.width' }),
    T('seatBackLeft', 'seat', 'Click the seat’s BACK-LEFT corner.', { notForPlan: 'd', feeds: 'seat.depth' }),
    T('seatBackRight', 'seat', 'Click the seat’s BACK-RIGHT corner.', { notForPlan: 'd', feeds: 'seat.depth' }),
    T('seatBackApex', 'seat', 'Click the furthest-back point of the seat, on the centreline.', { onlyForPlan: 'd', feeds: 'seat.depth' }),
    T('mortiseFrontLeft', 'legs', 'Click the centre of the FRONT-LEFT leg where it comes through the seat.', { feeds: 'legs.front.mortise' }),
    T('mortiseFrontRight', 'legs', 'Click the centre of the FRONT-RIGHT leg where it comes through the seat.', { feeds: 'legs.front.mortise' }),
    T('mortiseBackLeft', 'legs', 'Click the centre of the BACK-LEFT leg where it comes through the seat.', { feeds: 'legs.back.mortise' }),
    T('mortiseBackRight', 'legs', 'Click the centre of the BACK-RIGHT leg where it comes through the seat.', { feeds: 'legs.back.mortise' }),
    T('stickLeft', 'sticks', 'Click the centre of the LEFTMOST stick where it enters the seat.', { feeds: 'sticks.spread, sticks.rowZ' }),
    T('stickRight', 'sticks', 'Click the centre of the RIGHTMOST stick where it enters the seat.', { feeds: 'sticks.spread, sticks.rowZ' }),
  ];
}

/**
 * The schedule filtered for this project's views and chair.
 *
 * "This chair", not "this template": the Photos step asks whether it has arms,
 * and that answer decides which arm prompts appear — a bow gets its apex click,
 * a board arm gets its front-edge click, an answered "no arms" gets neither
 * even on a template that has them.
 */
export function schedule(project, template) {
  const planType = template.seat.plan.type;
  const armStyle = resolveArmStyle(project, template);
  const hasArms = armStyle !== null;
  const fullArms = armStyle === 'full';
  const bow = armStyle === 'bow';
  return fullSchedule().filter((item) => {
    const view = project.views[item.view];
    if (!view || !view.present) return false;
    if (item.needsArms && !hasArms) return false;
    if (item.needsFullArms && !fullArms) return false;
    if (item.needsBow && !bow) return false;
    if (item.notForBow && bow) return false;
    if (item.onlyForPlan && planType !== item.onlyForPlan) return false;
    if (item.notForPlan && planType === item.notForPlan) return false;
    return true;
  });
}

export function scheduleForView(project, template, viewId) {
  return schedule(project, template).filter((i) => i.view === viewId);
}

// ---------------------------------------------------------------------------
// Curve tracing (ANNOTATOR.md phase 3b — top view, rectified canvas only)
// ---------------------------------------------------------------------------
//
// A trace is a landmark schedule item that happens to be several clicks long.
// It uses the same viewport, the same loupe, the same drag and the same
// arrow-key nudge; the only new idea is the circle-fit ASSIST, which is offered
// and never applied on its own.
//
// Everything below is pure so test.mjs can drive it; steps.js does the drawing.

export const TRACES = [
  {
    id: 'comb',
    view: 'top',
    group: 'crest',
    label: 'comb centreline',
    closed: false,
    min: TRACE_MIN.comb,
    max: TRACE_MAX.comb,
    feeds: 'crest.planCurve + crest.length',
    prompt: 'Trace the comb’s CENTRELINE from its LEFT tip to its RIGHT tip — 3 to 7 clicks along the middle of the board.',
    hint: 'The traced length becomes the comb’s length, so the plan and the elevation agree with the photo instead of with the template.',
  },
  {
    id: 'armbow',
    view: 'top',
    group: 'arms',
    label: 'arm bow centreline',
    closed: false,
    needsBow: true,
    min: TRACE_MIN.armbow,
    max: TRACE_MAX.armbow,
    feeds: 'arms.bow.planCurve',
    prompt: 'Trace the arm bow’s CENTRELINE, LEFT tip first, round the back — 5 to 9 clicks. The tips must be the two ends.',
    hint: 'Span, apex depth and spindle spacing are all derived from this curve; nothing else in the spec fixes them.',
  },
  {
    id: 'seatOutline',
    view: 'top',
    group: 'seat',
    label: 'seat outline',
    closed: true,
    min: TRACE_MIN.seatOutline,
    max: TRACE_MAX.seatOutline,
    feeds: 'seat.plan (outline)',
    prompt: 'Trace the seat’s outline CLOCKWISE from the FRONT-LEFT corner — across the front, up the right side, round the back — 6 to 12 clicks. Do not click the first point twice.',
    hint: 'A traced outline replaces the template’s rectangle, and the seat’s width and depth become its own extents.',
  },
];

/** The traces available for this project's views and chair. */
export function traceSpecs(project, template) {
  const bow = resolveArmStyle(project, template) === 'bow';
  return TRACES.filter((t) => {
    const view = project.views[t.view];
    if (!view || !view.present) return false;
    if (t.needsBow && !bow) return false;
    return true;
  });
}

export function traceSpecsForView(project, template, viewId) {
  return traceSpecs(project, template).filter((t) => t.view === viewId);
}

/** The points of one trace, in the view's working pixel space. */
export function tracePoints(project, viewId, id) {
  return tracePointsOf(project.views[viewId], id);
}

/**
 * How one trace is doing: enough points yet, room for more, and what the
 * schedule sidebar should say about it.
 */
export function traceStatus(project, viewId, spec) {
  const points = tracePoints(project, viewId, spec.id);
  const n = points.length;
  const usable = n >= spec.min;
  return {
    id: spec.id,
    points,
    count: n,
    usable,
    full: n >= spec.max,
    text: n === 0
      ? 'not traced'
      : (usable ? `traced (${n} points)` : `${n} of ${spec.min} points — not used yet`),
  };
}

/**
 * Minimum gap between one traced click and the last, in the view's working
 * (canvas) pixels.
 *
 * SPEC.md forbids consecutive duplicate points and the renderer's validator
 * HARD-FAILS on them, so a double-click — or a click the user did not think
 * landed — could put a project in a state where the drawing step only shows an
 * exception. The points are also rounded to 4 decimals of chair units on the
 * way into the spec, so "not identical" is not enough; 1.5 px is well under a
 * deliberate click at any zoom (a hundredth of an inch on a typical rectified
 * canvas) and orders of magnitude over the rounding.
 */
export const TRACE_MIN_SPACING_PX = 1.5;

/**
 * Why this click cannot join the trace — or null when it can.
 *
 *   'previous'  it landed on the point before it
 *   'first'     it landed on the FIRST point of a closed trace, which the ring
 *               closes onto (the seat outline's prompt says so; the schema
 *               fails on it either way)
 */
export function traceClickBlock(points, p, { closed = false, spacing = TRACE_MIN_SPACING_PX } = {}) {
  if (!Array.isArray(points) || !points.length) return null;
  const near = (q) => q && Math.hypot(p.x - q.x, p.y - q.y) < spacing;
  if (near(points[points.length - 1])) return 'previous';
  if (closed && points.length >= 2 && near(points[0])) return 'first';
  return null;
}

/**
 * The circle-fit ASSIST. Traced points live in pixels, so the 1/16 in band the
 * renderer judges a radius by has to be converted at the view's own scale.
 *
 * -> { circle, radiusUnits, deviationUnits, fits } | null
 * `fits` true is the only time "snap to arc" is offered — and it is still the
 * user who presses it (SPEC.md: the assist is never applied silently).
 */
export function arcAssist(points, pxPerUnit, units) {
  if (!Array.isArray(points) || points.length < 3 || !(pxPerUnit > 0)) return null;
  const tolPx = fitToleranceFor(units) * pxPerUnit;
  // The CLICKED points are what gets fitted and what "snap to arc" would move,
  // so they are what the question is about.
  const fit = fitCircle(points, tolPx);
  if (!fit) return null;
  return {
    circle: { cx: fit.cx, cy: fit.cy, r: fit.r },
    radiusUnits: fit.r / pxPerUnit,
    deviationUnits: fit.maxDeviation / pxPerUnit,
    fits: fit.fits,
  };
}

/**
 * Move every traced point radially onto the fitted circle. The points keep
 * their order and their angular positions — this is "true up what I traced",
 * not "replace it with an arc of my choosing".
 */
export function snapToArc(points, circle) {
  return points.map((p) => {
    const dx = p.x - circle.cx;
    const dy = p.y - circle.cy;
    const d = Math.hypot(dx, dy);
    if (!(d > 0)) return { x: p.x, y: p.y };
    return { x: circle.cx + (dx / d) * circle.r, y: circle.cy + (dy / d) * circle.r };
  });
}

/**
 * A drawing step in PIXELS. The renderer's fixed step is quarter-inch in chair
 * units, which in screen pixels would be a few thousand samples per curve — the
 * right number for a drawing, the wrong one for a preview. The preview is only
 * ever pixels on a canvas, so it gets a pixel step; nothing stored depends on
 * it, and the drawing itself is still sampled by the renderer's own rule.
 */
function previewStep(points, closed) {
  const len = arcLength(points, { closed });
  return Math.max(1.5, len / 160);
}

/** The smoothed curve, for drawing the trace on the canvas as it is built. */
export function tracePreview(points, { closed = false } = {}) {
  if (!Array.isArray(points) || points.length < 2) return [];
  return samplePlanCurve(points, { closed, step: previewStep(points, closed) });
}

/** Length and chord of a trace in project units — the live readout. */
export function traceMeasure(points, pxPerUnit, { closed = false } = {}) {
  if (!Array.isArray(points) || points.length < 2 || !(pxPerUnit > 0)) return null;
  const sampled = tracePreview(points, { closed });
  return {
    along: arcLength(sampled, { closed }) / pxPerUnit,
    chord: chordLength(sampled) / pxPerUnit,
  };
}

export function isPlaced(project, id) {
  for (const view of Object.values(project.views)) {
    const p = view.landmarks && view.landmarks[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return true;
  }
  return false;
}

/** Progress for one view: placed / required / optional. */
export function progress(project, template, viewId) {
  const items = scheduleForView(project, template, viewId);
  const required = items.filter((i) => !i.optional);
  return {
    total: items.length,
    placed: items.filter((i) => isPlaced(project, i.id)).length,
    required: required.length,
    requiredPlaced: required.filter((i) => isPlaced(project, i.id)).length,
  };
}

/** Next unplaced landmark at or after `fromIndex`, wrapping once. */
export function nextUnplaced(items, project, fromIndex = 0) {
  const n = items.length;
  if (n === 0) return null;
  for (let step = 0; step < n; step += 1) {
    const i = (fromIndex + step) % n;
    if (!isPlaced(project, items[i].id)) return items[i];
  }
  return null;
}

/** Arrow-key nudge in image pixels: 0.5 px, or 5 px with shift. */
export function nudgeAmount(shift) {
  return shift ? 5 : 0.5;
}

export function nudged(point, dx, dy) {
  return { x: point.x + dx, y: point.y + dy };
}

// ---------------------------------------------------------------------------
// Template seeding (template-deform: the user adjusts, never cold-clicks)
// ---------------------------------------------------------------------------

function outerLeg(g, group, side) {
  return g.legs.find((l) => l.group === group && l.side === side) || g.legs[0];
}

/** Chair-frame seed points for one view, keyed by landmark id. */
export function seedPoints(template, viewId) {
  const g = forwardGeometry(template);
  const out = {};
  if (viewId === 'front') {
    const hw = g.seat.width / 2;
    out['front.seatTopLeft'] = { x: -hw, y: g.seat.heightFront };
    out['front.seatTopRight'] = { x: hw, y: g.seat.heightFront };
    const crestMidY = (g.crest.bottom.y + g.crest.topAtStick.y) / 2;
    out['front.crestLeft'] = { x: -g.crest.length / 2, y: crestMidY };
    out['front.crestRight'] = { x: g.crest.length / 2, y: crestMidY };
    const hs = g.sticks.spread / 2;
    out['front.stickSeatLeft'] = { x: -hs, y: g.sticks.baseY };
    out['front.stickSeatRight'] = { x: hs, y: g.sticks.baseY };
    out['front.stickCrestLeft'] = { x: -hs, y: g.crest.bottom.y };
    out['front.stickCrestRight'] = { x: hs, y: g.crest.bottom.y };
    if (g.arms) {
      out['front.armInsideLeft'] = { x: g.arms.insideLeft, y: g.arms.topY };
      out['front.armInsideRight'] = { x: g.arms.insideRight, y: g.arms.topY };
    }
    return out;
  }
  if (viewId === 'side') {
    out['side.seatFrontTop'] = { z: 0, y: g.seat.heightFront };
    out['side.seatBackTop'] = { z: g.seat.depth, y: g.seat.heightBack };
    out['side.seatFrontBottom'] = { z: 0, y: g.seat.frontBottom.y };
    for (const group of ['front', 'back']) {
      const leg = outerLeg(g, group, 'right');
      out[`side.${group}LegFoot`] = { z: leg.foot.z, y: 0 };
      out[`side.${group}LegSeat`] = { z: leg.mortise.z, y: leg.mortise.y };
    }
    const stick = g.sticks.items[g.sticks.items.length - 1] || g.sticks.items[0];
    out['side.stickBase'] = { z: stick.base.z, y: stick.base.y };
    out['side.stickTip'] = { z: stick.top.z, y: stick.top.y };
    out['side.crestBottom'] = { z: g.crest.bottom.z, y: g.crest.bottom.y };
    out['side.crestTop'] = { z: g.crest.topAtStick.z, y: g.crest.topAtStick.y };
    if (g.arms) {
      out['side.armTop'] = { z: 0, y: g.arms.topY };
      // A bow is level, so its apex sits at the same height — but a long way
      // back, which is where the ghost has to be or it is no help at all.
      out['side.bowTop'] = {
        z: g.arms.bow ? g.arms.bow.apexZ : g.seat.depth * 0.8,
        y: g.arms.topY,
      };
    }
    return out;
  }
  // top (plan coordinates)
  const hw = g.seat.width / 2;
  const plan = template.seat.plan;
  const bhw = plan.type === 'trapezoid' ? plan.backWidth / 2 : hw;
  out['top.seatFrontLeft'] = { x: -hw, z: 0 };
  out['top.seatFrontRight'] = { x: hw, z: 0 };
  if (plan.type === 'd') {
    out['top.seatBackApex'] = { x: 0, z: g.seat.depth };
  } else {
    out['top.seatBackLeft'] = { x: -bhw, z: g.seat.depth };
    out['top.seatBackRight'] = { x: bhw, z: g.seat.depth };
  }
  for (const leg of g.legs) {
    const name = `top.mortise${leg.group === 'front' ? 'Front' : 'Back'}${leg.side === 'left' ? 'Left' : 'Right'}`;
    out[name] = { x: leg.mortise.x, z: leg.mortise.z };
  }
  out['top.stickLeft'] = { x: -g.sticks.spread / 2, z: g.sticks.rowZ };
  out['top.stickRight'] = { x: g.sticks.spread / 2, z: g.sticks.rowZ };
  return out;
}

/**
 * A provisional per-view frame good enough to seed with, built from the
 * calibration alone plus whatever landmarks are already down. Returns null
 * when the view is not calibrated yet.
 */
export function seedFrame(project, template, viewId) {
  const view = project.views[viewId];
  if (!view) return null;
  const g = forwardGeometry(template);
  if (viewId === 'top') {
    const cal = topCalibration(view, project.units);
    if (!cal.ok) return null;
    const k = cal.pxPerUnit;
    const W = (view.rectWidth || 0) || k * 11;
    const H = (view.rectHeight || 0) || k * 8.5;
    const origin = { x: W / 2, y: H / 2 + (g.seat.depth * k) / 2 };
    return {
      pxPerUnit: k,
      place: (p) => ({ x: origin.x + p.x * k, y: origin.y - p.z * k }),
    };
  }
  const cal = elevationCalibration(view, project.units);
  if (!cal.ok) return null;
  const k = cal.pxPerUnit;
  const W = view.imageWidth || 1000;
  if (viewId === 'front') {
    const lm = view.landmarks || {};
    const l = lm['front.seatTopLeft'];
    const r = lm['front.seatTopRight'];
    const originX = l && r ? (l.x + r.x) / 2 : W / 2;
    return { pxPerUnit: k, place: (p) => ({ x: originX + p.x * k, y: cal.floorY - p.y * k }) };
  }
  const lm = view.landmarks || {};
  const f = lm['side.seatFrontTop'];
  const b = lm['side.seatBackTop'];
  const sign = f && b ? (f.x >= b.x ? 1 : -1) : 1;
  const originX = f ? f.x : W / 2 + (sign * g.seat.depth * k) / 2;
  return { pxPerUnit: k, place: (p) => ({ x: originX - sign * p.z * k, y: cal.floorY - p.y * k }) };
}

/**
 * seedLandmarks(project, template, viewId, { only })
 * -> { id: {x, y, source: 'seeded'} } in the view's working pixel space.
 * `only` limits the result to ids that are not yet placed (the usual call).
 *
 * Every point here is a coordinate the TEMPLATE chose, so every point here is
 * stamped 'seeded' at birth (store.js). Whatever the UI does with them next —
 * draw them as ghosts, materialise one under a drag, write the lot in with
 * "accept all template positions" — the provenance travels with the point, and
 * nothing downstream has to remember to add it.
 */
export function seedLandmarks(project, template, viewId, { onlyUnplaced = true } = {}) {
  const frame = seedFrame(project, template, viewId);
  if (!frame) return {};
  const items = scheduleForView(project, template, viewId);
  const chairPts = seedPoints(template, viewId);
  const out = {};
  for (const item of items) {
    if (onlyUnplaced && isPlaced(project, item.id)) continue;
    const p = chairPts[item.id];
    if (!p) continue;
    const q = frame.place(p);
    out[item.id] = { x: q.x, y: q.y, source: 'seeded' };
  }
  return out;
}

/** Did the template put this landmark here, rather than the user? */
export function isSeeded(project, id) {
  for (const view of Object.values(project.views || {})) {
    const p = view.landmarks && view.landmarks[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p.source === 'seeded';
  }
  return false;
}
