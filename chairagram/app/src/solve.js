// solve.js — calibration + landmarks -> chair spec fields.
//
// PURE. No DOM, no Date, no random. Everything here is imported by test.mjs
// under plain node; the UI modules only ever read its output.
//
// Conventions (SPEC.md):
//   chair frame: origin at the centre of the seat's FRONT edge, at FLOOR level
//   +X right (as seen from the front), +Y up, +Z toward the back
//   rake  +  = foot displaced toward the back (+Z)
//   lean  +  = stick top toward the back
//
// Image conventions:
//   Elevation views work in the ORIGINAL image pixel space, y DOWN.
//   The top view works in RECTIFIED pixel space (see homography.js) — every
//   top landmark is clicked after rectification, so a rectified pixel is a
//   fixed number of project units no matter where it sits in the frame.
//
// KNOWN LIMITATION (phase 2, per ANNOTATOR.md): splay is not solved. Two
// orthogonal elevations plus a plan give enough information to recover it
// (the front-view foot offset), but the landmark schedule deliberately does
// not ask for the front-view foot centres yet, so every leg keeps the
// template's splay — 0 on both JP goldens. The schema already carries it.
//
// v0.2 curves (phase 3b): the top view can also carry TRACES — the comb's
// centreline, the arm bow's centreline, the seat's outline. They arrive in
// rectified pixels, go through the same top frame as every other top landmark,
// and come out as chair-frame [[x, z], …] pairs. Nothing here smooths or
// resamples them (SPEC.md: consumers must not resample on load); all curve
// maths is imported from the renderer's one curve module.

import { convertLength } from './homography.js';
import { reconcile, compare } from './reconcile.js';
import {
  fromPairs, samplePlanCurve, arcLength, chordLength, extents,
  fitCircle, fitToleranceFor, selfIntersects, maxChordDeviation,
} from '../../renderer/src/curve.js';
// The renderer's own gate, imported rather than restated: a trace this module
// accepts and the renderer then rejects is the worst of both worlds — the user
// gets an exception instead of a note, on a step that cannot fix it.
import { bowOpensForward } from '../../renderer/src/schema.js';

const RAD = Math.PI / 180;
export const toDeg = (r) => r / RAD;
export const toRad = (d) => d * RAD;

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dot = (a, b) => a.x * b.x + a.y * b.y;

export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** Inches -> the project's units. Only the handful of documented defaults. */
function inUnits(inches, units) {
  return round4(units === 'mm' ? inches * 25.4 : inches);
}

// ---------------------------------------------------------------------------
// The two topology answers (store.js: project.armStyle / project.crestTenons)
// ---------------------------------------------------------------------------

/**
 * What kind of arms this chair really has: the Photos-step answer when it was
 * given, the template's own fact when it was not.
 *
 * -> null | 'full' | 'end-boards' | 'bow'
 *
 * `null` from `project.armStyle` means UNANSWERED, which is not the same as
 * 'none'. Everything that used to test `template.arms` has to come through
 * here, or answering "no arms" on a template that has them would still solve
 * an arm height.
 */
export function resolveArmStyle(project, template) {
  const answer = project && project.armStyle;
  if (answer === 'none') return null;
  if (answer === 'armbow') return 'bow';
  return template && template.arms ? template.arms.style : null;
}

/** True when the answered/template arms are a v0.2 steam-bent bow. */
export function hasArmbow(project, template) {
  return resolveArmStyle(project, template) === 'bow';
}

/** `sticks.throughCrest` per the Photos answer; null = leave the template be. */
export function resolveThroughCrest(project) {
  if (!project) return null;
  if (project.crestTenons === 'through') return true;
  if (project.crestTenons === 'blind') return false;
  return null;
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

/** The raw traced points of one curve, in the view's own working pixel space. */
export function tracePointsOf(view, id) {
  const arr = view && view.traces && view.traces[id];
  return Array.isArray(arr) ? arr : [];
}

/**
 * Click counts per curve, from ANNOTATOR.md's curve-tracing section. A trace
 * shorter than its minimum is ignored outright — half a comb is not a comb, and
 * the template's own curve is a better answer than a guess at the rest.
 */
export const TRACE_MIN = { comb: 3, armbow: 5, seatOutline: 6 };
export const TRACE_MAX = { comb: 7, armbow: 9, seatOutline: 12 };

/**
 * What a bow trace that fails the renderer's gate is told. It names the step
 * that can fix it: a curve is traced on Landmarks and is read-only everywhere
 * else, so "edit it on the Spec step" would be a dead end.
 */
export const BOW_RETRACE_NOTE = 'The traced arm bow does not open forward — both tips have to sit ahead (smaller z) of its deepest point, and one of yours does not. Re-trace the bow on the Landmarks step, top view, starting at the LEFT tip and going round the back. Until then the bow keeps the template’s shape.';

// ---------------------------------------------------------------------------
// The top view is only true on the seat plane
// ---------------------------------------------------------------------------
//
// The paper sheet lies ON THE SEAT, so the homography that rectifies the top
// view is exact for the seat plane and for nothing else. A part standing above
// the seat is CLOSER to the camera than the seat is, so it photographs bigger:
// a part at height h, shot from a camera H above the seat, is magnified by
// H / (H − h). Halfway up to the camera and it reads twice its size.
//
// That is fine for everything the top view was designed for — the seat outline,
// the mortises, the stick row all sit on the seat plane. It is not fine for the
// two traced curves that stand well clear of it: the comb (a foot to three feet
// up) and the arm bow (a hand's span up). Their SHAPE survives — a uniform
// magnification does not bend anything — but every SIZE derived from them is
// inflated by a factor nobody measured. DESIGN.md rejected floor-plane scale at
// seat height over an error of about 20%; this is the same error, often larger.
//
// The comb has a way out, and it is D6's shape-vs-size split doing exactly what
// it was built for: arc ÷ chord is a pure shape ratio, unchanged by any uniform
// magnification, so the trace can supply the ratio while the FRONT view — which
// sees the comb square on, in its own plane — supplies the chord. See
// `applyCombSize`. The bow has no such measurement in the schedule, so it gets
// the plain-language warning instead; inventing a landmark for it is a v0.3
// design decision, not a bug fix.

/** Said when the comb's length has to come from the magnified top view. */
export const COMB_TOP_SCALE_NOTE = 'The comb’s length here is read off your top-view trace, and the top view is only true on the SEAT plane — the plane of the sheet you laid on the seat. The comb stands well above that, closer to the camera, so it photographs LONGER than it is (a part halfway up to the camera reads twice its size). Click the comb’s two ends in the FRONT view as well: the app will then take the comb’s SIZE from there and keep its SHAPE from your trace.';

/** Said whenever an arm bow is traced, because nothing here can correct it. */
export const BOW_TOP_SCALE_NOTE = 'The arm bow is traced on the top view, which is only true on the SEAT plane. The bow sits a hand’s span above the seat, closer to the camera, so it photographs bigger than it is — and its span, how far back the apex reaches and where the short spindles land are all derived from that trace, so they carry the same stretch (commonly a fifth to a third, depending how high you held the phone). The SHAPE is right. Check the span against a tape before you bend stock; there is no front-view bow measurement in the schedule yet to correct it with.';

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Elevation calibration: two-click scale bar + two-click floor line.
 * v0 treats the floor as horizontal at the mean y of the two clicks; the raw
 * clicks stay in the project so a tilt correction can land later.
 */
export function elevationCalibration(view, units) {
  const problems = [];
  const c = (view && view.calib) || {};
  const s = c.scale || {};
  const f = c.floor || {};
  let pxPerUnit = null;
  if (s.a && s.b && Number.isFinite(s.value) && s.value > 0) {
    const px = dist(s.a, s.b);
    if (px < 1e-6) {
      problems.push('the two scale points are on top of each other');
    } else {
      pxPerUnit = px / convertLength(s.value, s.unit || units, units);
    }
  } else {
    problems.push('scale reference not set');
  }
  let floorY = null;
  let floorTiltDeg = 0;
  if (f.a && f.b) {
    floorY = (f.a.y + f.b.y) / 2;
    floorTiltDeg = toDeg(Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x));
    if (Math.abs(floorTiltDeg) > 90) floorTiltDeg = 180 - Math.abs(floorTiltDeg);
  } else {
    problems.push('floor line not set');
  }
  return {
    kind: 'elevation',
    ok: pxPerUnit !== null && floorY !== null,
    pxPerUnit,
    floorY,
    floorTiltDeg,
    problems,
  };
}

/** Top-view calibration: the rectified canvas is metric by construction. */
export function topCalibration(view, units) {
  const problems = [];
  const p = (view && view.calib && view.calib.paper) || {};
  const corners = p.corners || [];
  if (corners.length !== 4) problems.push('paper corners not set');
  const pxPerUnit = Number.isFinite(p.pxPerUnit) && p.pxPerUnit > 0 ? p.pxPerUnit : null;
  if (pxPerUnit === null) problems.push('rectified scale not computed');
  return {
    kind: 'top',
    ok: corners.length === 4 && pxPerUnit !== null,
    pxPerUnit,
    units,
    problems,
  };
}

export function viewCalibration(project, viewId) {
  const view = project.views[viewId];
  return viewId === 'top'
    ? topCalibration(view, project.units)
    : elevationCalibration(view, project.units);
}

// ---------------------------------------------------------------------------
// Per-view frames — the bridge between image pixels and the chair frame
// ---------------------------------------------------------------------------

/**
 * A front-elevation frame. `originX` is the chair centreline in image px,
 * taken from the seat-top pair when available (otherwise the image centre).
 * Chair (x, y) -> image px:  ix = originX + x*k,  iy = floorY - y*k
 */
export function frontFrame(project) {
  const view = project.views.front;
  const cal = elevationCalibration(view, project.units);
  if (!cal.ok) return null;
  const lm = view.landmarks || {};
  const l = lm['front.seatTopLeft'];
  const r = lm['front.seatTopRight'];
  const originX = l && r ? (l.x + r.x) / 2 : (view.imageWidth || 0) / 2;
  return {
    kind: 'front',
    pxPerUnit: cal.pxPerUnit,
    floorY: cal.floorY,
    originX,
    toImage: (p) => ({ x: originX + p.x * cal.pxPerUnit, y: cal.floorY - p.y * cal.pxPerUnit }),
    toChair: (q) => ({ x: (q.x - originX) / cal.pxPerUnit, y: (cal.floorY - q.y) / cal.pxPerUnit }),
  };
}

/**
 * A side-elevation frame. `sign` is +1 when the chair's FRONT is to the right
 * of the photo, -1 when it faces left; it is read from the two seat-top
 * landmarks so a mirrored shot solves identically.
 * Chair (z, y) -> image px:  ix = originX - sign*z*k,  iy = floorY - y*k
 */
export function sideFrame(project) {
  const view = project.views.side;
  const cal = elevationCalibration(view, project.units);
  if (!cal.ok) return null;
  const lm = view.landmarks || {};
  const f = lm['side.seatFrontTop'];
  const b = lm['side.seatBackTop'];
  if (!f || !b) return null;
  const sign = f.x >= b.x ? 1 : -1;
  const originX = f.x;
  const k = cal.pxPerUnit;
  return {
    kind: 'side',
    pxPerUnit: k,
    floorY: cal.floorY,
    originX,
    sign,
    toImage: (p) => ({ x: originX - sign * p.z * k, y: cal.floorY - p.y * k }),
    toChair: (q) => ({ z: -sign * (q.x - originX) / k, y: (cal.floorY - q.y) / k }),
  };
}

/**
 * A rectified-top frame built from the seat's front corners. Direction of +Z
 * is chosen so the seat's back lies at positive z, which makes the frame
 * independent of how the photographer held the camera.
 */
export function topFrame(project) {
  const view = project.views.top;
  const cal = topCalibration(view, project.units);
  if (!cal.ok) return null;
  const lm = view.landmarks || {};
  const FL = lm['top.seatFrontLeft'];
  const FR = lm['top.seatFrontRight'];
  if (!FL || !FR) return null;
  const backPts = ['top.seatBackLeft', 'top.seatBackRight', 'top.seatBackApex']
    .map((id) => lm[id]).filter(Boolean);
  if (backPts.length === 0) return null;
  const width = dist(FL, FR) / cal.pxPerUnit;
  if (!(width > 0)) return null;
  const origin = mid(FL, FR);
  const d = sub(FR, FL);
  const len = Math.hypot(d.x, d.y);
  const ex = { x: d.x / len, y: d.y / len };
  let ez = { x: -ex.y, y: ex.x };
  const backMid = backPts.reduce(
    (acc, p) => ({ x: acc.x + p.x / backPts.length, y: acc.y + p.y / backPts.length }),
    { x: 0, y: 0 },
  );
  if (dot(sub(backMid, origin), ez) < 0) ez = { x: ex.y, y: -ex.x };
  const k = cal.pxPerUnit;
  const rawPlan = (q) => {
    const v = sub(q, origin);
    return { x: dot(v, ex) / k, z: dot(v, ez) / k };
  };
  // A traced seat outline is a better fore-aft datum than two clicked corners.
  // SPEC.md puts the chair-frame origin on the seat's FRONT EDGE, and on a
  // shaped seat the frontmost traced point IS that edge, while "the front-left
  // corner" is a judgement call. So when an outline exists, shift z (never x)
  // until its frontmost point reads 0 — and shift EVERY top measurement with
  // it, so the mortises, the stick row and the outline stay in one frame.
  let zDatum = 0;
  const outline = tracePointsOf(view, 'seatOutline');
  if (outline.length >= TRACE_MIN.seatOutline) {
    zDatum = Math.min(...outline.map((p) => rawPlan(p).z));
  }
  return {
    kind: 'top',
    pxPerUnit: k,
    origin,
    ex,
    ez,
    zDatum,
    toPlan: (q) => {
      const p = rawPlan(q);
      return { x: p.x, z: p.z - zDatum };
    },
    toImage: (p) => {
      const z = p.z + zDatum;
      return {
        x: origin.x + (p.x * ex.x + z * ez.x) * k,
        y: origin.y + (p.x * ex.y + z * ez.y) * k,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Forward geometry — spec -> chair-frame key points
// ---------------------------------------------------------------------------

/**
 * The inverse of the solver: the handful of chair-frame points the annotator
 * cares about, derived from a spec. Used to seed landmarks from a template and
 * to draw the onion-skin wireframe. Mirrors renderer/src/geometry.js but is
 * deliberately independent of it — the annotator must not break when the
 * renderer's internal model changes shape.
 */
export function forwardGeometry(spec) {
  const { seat, sticks, crest } = spec;
  const cos = (d) => Math.cos(toRad(d));
  const sin = (d) => Math.sin(toRad(d));
  const tan = (d) => Math.tan(toRad(d));

  const slope = toDeg(Math.atan((seat.heightFront - seat.heightBack) / seat.depth));
  const seatTopAt = (z) => seat.heightFront - ((seat.heightFront - seat.heightBack) * z) / seat.depth;
  const verticalThickness = seat.thickness / cos(slope);

  let arms = null;
  if (spec.arms && spec.arms.style === 'bow') {
    // A v0.2 bow is a bent stick, not a board: its width, its inside clearance
    // and its fore-aft reach all come from the traced centreline, and nothing
    // in the spec fixes them separately (renderer/src/geometry.js does the
    // same). Sampling here keeps the onion-skin honest about a curved member.
    const bow = spec.arms.bow;
    const section = bow.section;
    const flat = samplePlanCurve(fromPairs(bow.planCurve.points), { units: spec.meta.units });
    const box = extents(flat);
    const topY = seat.heightFront + spec.arms.aboveSeat;
    arms = {
      topY,
      botY: topY - section,
      boardWidth: section,
      style: 'bow',
      bow: {
        section,
        points: flat.map((p) => ({ x: p.x, z: p.y })),
        xMin: box.minX,
        xMax: box.maxX,
        tipZ: (flat[0].y + flat[flat.length - 1].y) / 2,
        apexZ: box.maxY,
        span: Math.hypot(
          flat[flat.length - 1].x - flat[0].x,
          flat[flat.length - 1].y - flat[0].y,
        ),
      },
    };
    arms.insideLeft = box.minX + section / 2;
    arms.insideRight = box.maxX - section / 2;
    arms.insideWidth = arms.insideRight - arms.insideLeft;
  } else if (spec.arms) {
    const topY = seat.heightFront + spec.arms.aboveSeat;
    arms = {
      topY,
      botY: topY - spec.arms.thickness,
      boardWidth: spec.arms.boardWidth,
      style: spec.arms.style,
    };
    const fronts = spec.legs.filter((l) => l.id.startsWith('front-'));
    const cx = (side) => {
      const leg = fronts.find((l) => l.id.endsWith(side));
      return leg ? leg.mortise.x : (side === 'left' ? -seat.width / 2 : seat.width / 2);
    };
    arms.insideLeft = cx('left') + spec.arms.boardWidth / 2;
    arms.insideRight = cx('right') - spec.arms.boardWidth / 2;
    arms.insideWidth = arms.insideRight - arms.insideLeft;
  }

  const legs = spec.legs.map((leg) => {
    const mortiseY = seatTopAt(leg.mortise.z);
    const outboard = leg.mortise.x < 0 ? -1 : 1;
    const foot = {
      x: leg.mortise.x + outboard * tan(leg.splay) * mortiseY,
      y: 0,
      z: leg.mortise.z + tan(leg.rake) * mortiseY,
    };
    // A bow does not carry the legs (SPEC.md v0.2; the renderer warns and draws
    // it as if throughArm were false), so a leg never rises to a bow's height.
    const goesThroughArm = Boolean(arms && leg.throughArm && arms.style !== 'bow');
    const topY = goesThroughArm ? arms.topY : mortiseY;
    const rise = topY - mortiseY;
    return {
      id: leg.id,
      group: leg.id.startsWith('front-') ? 'front' : 'back',
      side: leg.id.endsWith('left') ? 'left' : 'right',
      rake: leg.rake,
      splay: leg.splay,
      section: leg.section,
      mortise: { x: leg.mortise.x, y: mortiseY, z: leg.mortise.z },
      foot,
      top: {
        x: leg.mortise.x - outboard * tan(leg.splay) * rise,
        y: topY,
        z: leg.mortise.z - tan(leg.rake) * rise,
      },
    };
  });

  const lean = sticks.lean;
  const baseY = seatTopAt(sticks.rowZ);
  const tilt = crest.tiltRef === 'sticks' ? lean : slope;
  const alongToCrestBottom = crest.bottomAboveSeat / cos(lean);
  const alongThroughCrest = crest.height / cos(lean - tilt);
  const alongTotal = sticks.throughCrest
    ? alongToCrestBottom + alongThroughCrest
    : alongToCrestBottom;
  const pitch = sticks.count > 1 ? sticks.spread / (sticks.count - 1) : 0;

  const crestBottomY = baseY + crest.bottomAboveSeat;
  const crestBottomZ = sticks.rowZ + tan(lean) * crest.bottomAboveSeat;
  const crestTopAtStick = {
    y: crestBottomY + alongThroughCrest * cos(lean),
    z: crestBottomZ + alongThroughCrest * sin(lean),
  };

  const items = [];
  for (let i = 0; i < sticks.count; i += 1) {
    const x = sticks.count === 1 ? 0 : -sticks.spread / 2 + pitch * i;
    items.push({
      index: i,
      x,
      base: { x, y: baseY, z: sticks.rowZ },
      top: { x, y: baseY + alongTotal * cos(lean), z: sticks.rowZ + alongTotal * sin(lean) },
    });
  }

  const boardRise = crest.height * cos(tilt);
  const tenonRise = (crest.height * cos(lean)) / cos(lean - tilt);
  const overallHeight = crestBottomY + (sticks.throughCrest ? tenonRise : boardRise);

  return {
    slope,
    seat: {
      width: seat.width,
      depth: seat.depth,
      heightFront: seat.heightFront,
      heightBack: seat.heightBack,
      thickness: seat.thickness,
      verticalThickness,
      topAt: seatTopAt,
      frontTop: { y: seat.heightFront, z: 0 },
      backTop: { y: seat.heightBack, z: seat.depth },
      frontBottom: { y: seat.heightFront - verticalThickness, z: 0 },
      backBottom: { y: seat.heightBack - verticalThickness, z: seat.depth },
    },
    legs,
    sticks: {
      count: sticks.count,
      spread: sticks.spread,
      rowZ: sticks.rowZ,
      lean,
      pitch,
      baseY,
      items,
      alongToCrestBottom,
      alongThroughCrest,
      alongTotal,
    },
    crest: {
      length: crest.length,
      height: crest.height,
      thickness: crest.thickness,
      tilt,
      bottom: { y: crestBottomY, z: crestBottomZ },
      topAtStick: crestTopAtStick,
    },
    arms,
    overallHeight,
  };
}

// ---------------------------------------------------------------------------
// The measured fields
// ---------------------------------------------------------------------------

function lmOf(view) {
  return (view && view.landmarks) || {};
}

/**
 * Does this reading lean on a point the TEMPLATE placed?
 *
 * store.js gives every landmark a `source`; 'seeded' means the template put it
 * there and the user has left it alone. A number derived from one of those is
 * not a reading off this chair, however it is dressed up, so it travels with a
 * flag and the trust accounting refuses to count it (see `sourceOf`).
 *
 * Conservative on purpose: ONE seeded input taints the value. A crest height
 * measured between a clicked point and a template point is not half measured.
 */
function seededAny(...pts) {
  return pts.some((p) => p && p.source === 'seeded');
}

function push(map, field, value, source, seeded = false) {
  if (!Number.isFinite(value)) return;
  if (!map[field]) map[field] = [];
  const entry = { value, source };
  if (seeded) entry.seeded = true;
  map[field].push(entry);
}

/**
 * measureSide(project, template) -> { measurements, checks, notes }
 * Heights are (floorY - pointY) / scale. Angles are atan2 against the floor
 * horizontal, with the fore-aft sign taken from the view's own frame.
 */
export function measureSide(project, template) {
  const out = { measurements: {}, checks: [], notes: [] };
  const view = project.views.side;
  if (!view || !view.present) return out;
  const frame = sideFrame(project);
  if (!frame) return out;
  const lm = lmOf(view);
  const k = frame.pxPerUnit;
  const H = (p) => (frame.floorY - p.y) / k;      // height above the floor
  const Z = (dx) => (-frame.sign * dx) / k;       // image dx -> chair dz (+ = back)
  const M = out.measurements;

  const fTop = lm['side.seatFrontTop'];
  const bTop = lm['side.seatBackTop'];
  const heightFront = H(fTop);
  const heightBack = H(bTop);
  const depth = Z(bTop.x - fTop.x);
  // The side frame's ORIGIN and its facing come from these two as well, but a
  // rake or a lean is an angle between two other points and a horizontal floor
  // — it does not move when the origin does. So each reading is flagged for the
  // points that actually enter its arithmetic, not for the frame.
  const seatSeeded = seededAny(fTop, bTop);
  push(M, 'seat.heightFront', heightFront, 'side', seatSeeded);
  push(M, 'seat.heightBack', heightBack, 'side', seatSeeded);
  push(M, 'seat.depth', depth, 'side', seatSeeded);
  if (heightBack > heightFront) {
    out.notes.push('The seat back reads higher than the seat front — check the two seat-top clicks (the schema requires heightBack <= heightFront).');
  }

  const slope = depth > 0
    ? toDeg(Math.atan((heightFront - heightBack) / depth))
    : 0;

  const fBot = lm['side.seatFrontBottom'];
  if (fBot) {
    // The stated thickness is perpendicular to the sloped face, so the drop
    // measured straight down at the front edge is thickness / cos(slope).
    const drop = heightFront - H(fBot);
    push(M, 'seat.thickness', drop * Math.cos(toRad(slope)), 'side', seededAny(fTop, bTop, fBot));
  }

  for (const group of ['front', 'back']) {
    const foot = lm[`side.${group}LegFoot`];
    const entry = lm[`side.${group}LegSeat`];
    if (!foot || !entry) continue;
    const dz = Z(foot.x - entry.x);
    const drop = H(entry) - H(foot);
    if (Math.abs(drop) < 1e-9) continue;
    push(M, `legs.${group}.rake`, toDeg(Math.atan2(dz, drop)), 'side', seededAny(foot, entry));
    out.checks.push({
      key: `check.${group}FootStance`,
      label: `${group} foot, behind the seat front`,
      value: Z(foot.x - fTop.x),
      kind: 'length',
      source: 'side',
    });
  }

  const sBase = lm['side.stickBase'];
  const sTip = lm['side.stickTip'];
  let lean = null;
  if (sBase && sTip) {
    const rise = H(sTip) - H(sBase);
    if (Math.abs(rise) > 1e-9) {
      lean = toDeg(Math.atan2(Z(sTip.x - sBase.x), rise));
      push(M, 'sticks.lean', lean, 'side', seededAny(sBase, sTip));
    }
  }

  const cBot = lm['side.crestBottom'];
  const cTop = lm['side.crestTop'];
  if (cBot && sBase) {
    push(M, 'crest.bottomAboveSeat', H(cBot) - H(sBase), 'side', seededAny(cBot, sBase));
  }
  if (cBot && cTop && lean !== null) {
    // The two clicks straddle the crest board along the stick's own axis, so
    // the distance between them is the board height divided by cos(lean-tilt).
    // The tilt reference drags in the stick lean (and, on a seat-tilted crest,
    // the two seat corners), so all of them count towards the provenance.
    const along = dist(cBot, cTop) / k;
    const tiltFromSticks = template.crest.tiltRef === 'sticks';
    const tilt = tiltFromSticks ? lean : slope;
    push(M, 'crest.height', along * Math.cos(toRad(lean - tilt)), 'side',
      seededAny(cBot, cTop, sBase, sTip, ...(tiltFromSticks ? [] : [fTop, bTop])));
  }

  // The arm's height above the seat. A board arm is clicked at the seat's front
  // edge; a v0.2 bow is level, so its APEX — the one place a bow is easy to see
  // against the background — reads the same number.
  const armStyle = resolveArmStyle(project, template);
  const armTop = armStyle === 'bow' ? lm['side.bowTop'] : lm['side.armTop'];
  if (armTop && armStyle) {
    push(M, 'arms.aboveSeat', H(armTop) - heightFront, 'side', seededAny(armTop, fTop));
  }
  return out;
}

export function measureFront(project) {
  const out = { measurements: {}, checks: [], notes: [] };
  const view = project.views.front;
  if (!view || !view.present) return out;
  const cal = elevationCalibration(view, project.units);
  if (!cal.ok) return out;
  const lm = lmOf(view);
  const k = cal.pxPerUnit;
  const M = out.measurements;
  const span = (a, b) => (lm[a] && lm[b] ? Math.abs(lm[b].x - lm[a].x) / k : null);
  // Front-view widths are a distance between two clicks and a scale bar; the
  // frame's origin never enters them, so each one is flagged for its own pair.
  const seeded = (a, b) => seededAny(lm[a], lm[b]);

  const width = span('front.seatTopLeft', 'front.seatTopRight');
  if (width !== null) push(M, 'seat.width', width, 'front', seeded('front.seatTopLeft', 'front.seatTopRight'));

  const crestLen = span('front.crestLeft', 'front.crestRight');
  if (crestLen !== null) push(M, 'crest.length', crestLen, 'front', seeded('front.crestLeft', 'front.crestRight'));

  const spreadSeat = span('front.stickSeatLeft', 'front.stickSeatRight');
  if (spreadSeat !== null) push(M, 'sticks.spread', spreadSeat, 'front', seeded('front.stickSeatLeft', 'front.stickSeatRight'));

  const spreadCrest = span('front.stickCrestLeft', 'front.stickCrestRight');
  if (spreadCrest !== null) {
    out.checks.push({
      key: 'check.stickSpreadAtCrest',
      label: 'outer sticks, centre to centre at the crest',
      value: spreadCrest,
      kind: 'length',
      source: 'front',
    });
    if (spreadSeat !== null && Math.abs(spreadCrest - spreadSeat) > Math.max(0.02 * spreadSeat, 0.25)) {
      out.notes.push('The outer sticks are not parallel — spread at the crest differs from spread at the seat. Phase 2 draws parallel sticks and uses the seat-level spread.');
    }
  }

  const inside = span('front.armInsideLeft', 'front.armInsideRight');
  if (inside !== null) {
    out.checks.push({
      key: 'check.armsInside',
      label: 'inside arms, clear width',
      value: inside,
      kind: 'length',
      source: 'front',
    });
  }
  return out;
}

export function measureTop(project, template) {
  const out = {
    measurements: {}, checks: [], notes: [], curves: {},
  };
  const view = project.views.top;
  if (!view || !view.present) return out;
  const frame = topFrame(project);
  if (!frame) return out;
  const lm = lmOf(view);
  const M = out.measurements;
  const P = (id) => (lm[id] ? frame.toPlan(lm[id]) : null);
  // Unlike the elevations, the top view has no floor line and no natural
  // horizon: its origin, its centreline and its +x direction ALL come from the
  // two clicked front corners. Move them and every x and z in this view moves
  // with them, so anything read here inherits their provenance — a mortise
  // measured off a template-placed centreline is a template number wearing a
  // measurement's clothes.
  const frameSeeded = seededAny(lm['top.seatFrontLeft'], lm['top.seatFrontRight']);
  const seeded = (...ids) => frameSeeded || seededAny(...ids.map((id) => lm[id]));
  // A trace, converted to chair-frame [[x, z], …] pairs. Exactly as clicked:
  // no smoothing, no resampling, no reordering of the points themselves.
  const toPairs = (pts) => pts.map((p) => {
    const q = frame.toPlan(p);
    return [round4(q.x), round4(q.z)];
  });
  const units = project.units;

  measureTraces(view, template, project, out, toPairs, units);

  const FL = P('top.seatFrontLeft');
  const FR = P('top.seatFrontRight');
  const width = Math.abs(FR.x - FL.x);
  const tracedPlan = out.curves.seatPlan;
  if (tracedPlan) {
    // SPEC.md v0.2: with an outline, width and depth ARE the traced extents —
    // and the renderer warns when the stored numbers disagree with them. So the
    // trace supersedes the corner clicks for this view's reading of both, and
    // the clicks become a cross-check.
    const box = extents(fromPairs(tracedPlan.points));
    // A trace is always the user's own hand, but it is expressed in a frame the
    // corner clicks define, so `frameSeeded` still applies.
    push(M, 'seat.width', box.width, 'top', frameSeeded);
    push(M, 'seat.depth', box.height, 'top', frameSeeded);
    out.checks.push({
      key: 'check.seatCornerWidth',
      label: 'seat width across the two clicked front corners',
      value: width,
      kind: 'length',
      source: 'top',
    });
  } else {
    push(M, 'seat.width', width, 'top', frameSeeded);
    const planType = template.seat.plan.type;
    if (planType === 'd') {
      const apex = P('top.seatBackApex');
      if (apex) push(M, 'seat.depth', apex.z, 'top', seeded('top.seatBackApex'));
      out.notes.push('D-plan seats: the back radius is carried over from the template (the schedule does not yet ask for the arc tangent points).');
    } else {
      const BL = P('top.seatBackLeft');
      const BR = P('top.seatBackRight');
      if (BL && BR) {
        const backSeeded = seeded('top.seatBackLeft', 'top.seatBackRight');
        push(M, 'seat.depth', (BL.z + BR.z) / 2, 'top', backSeeded);
        const backWidth = Math.abs(BR.x - BL.x);
        out.checks.push({
          key: 'check.seatBackWidth',
          label: 'seat width at the back edge',
          value: backWidth,
          kind: 'length',
          source: 'top',
        });
        const tol = Math.max(0.02 * width, project.units === 'mm' ? 6.35 : 0.25);
        if (Math.abs(backWidth - width) > tol) {
          push(M, 'seat.plan.backWidth', backWidth, 'top', backSeeded);
          out.notes.push('The seat is narrower (or wider) at the back than at the front — solved as a trapezoid plan.');
        }
      }
    }
  }

  const asym = [];
  for (const group of ['front', 'back']) {
    const L = P(`top.mortise${cap(group)}Left`);
    const R = P(`top.mortise${cap(group)}Right`);
    if (!L || !R) continue;
    // Mirror-average: |x| averaged, asymmetry recorded (ANNOTATOR.md).
    const magnitude = (Math.abs(L.x) + Math.abs(R.x)) / 2;
    const legSeeded = seeded(`top.mortise${cap(group)}Left`, `top.mortise${cap(group)}Right`);
    push(M, `legs.${group}.mortise.x`, magnitude, 'top', legSeeded);
    push(M, `legs.${group}.mortise.z`, (L.z + R.z) / 2, 'top', legSeeded);
    const d = Math.abs(Math.abs(L.x) - Math.abs(R.x));
    if (d > (project.units === 'mm' ? 3.2 : 0.125)) {
      asym.push(`${group} legs sit ${fmtShort(d)} off-centre from each other`);
    }
  }
  if (asym.length) {
    out.notes.push(`Left/right asymmetry recorded and averaged: ${asym.join('; ')}.`);
  }

  const SL = P('top.stickLeft');
  const SR = P('top.stickRight');
  if (SL && SR) {
    const stickSeeded = seeded('top.stickLeft', 'top.stickRight');
    push(M, 'sticks.spread', Math.abs(SR.x - SL.x), 'top', stickSeeded);
    push(M, 'sticks.rowZ', (SL.z + SR.z) / 2, 'top', stickSeeded);
  }
  return out;
}

/**
 * The three v0.2 traces, converted to chair-frame curves.
 *
 * Writes into `out.curves`:
 *   crest     { points, alongLength, chord }   comb centreline
 *   bow       { points, span, apexDepth }      arm bow centreline
 *   seatPlan  { points }                       seat outline (closed ring)
 *
 * The only measurement it contributes directly is `crest.length`, and that one
 * matters: SPEC.md makes the traced points the comb's SHAPE and `crest.length`
 * its SIZE, and the renderer scales the shape until the two agree.
 *
 * The length is measured off the SAMPLED curve — the same smoothing the
 * renderer applies — so the two agree about what "along the curve" means. It is
 * only PROVISIONAL here: the comb stands well above the seat plane the top view
 * is rectified on, so this reading is magnified (see COMB_TOP_SCALE_NOTE), and
 * `applyCombSize` replaces it with the front view's chord × this trace's shape
 * ratio whenever a front-view chord has actually been clicked. Deciding that
 * needs both views at once, which is why it happens in solveProject and not
 * here.
 */
function measureTraces(view, template, project, out, toPairs, units) {
  const M = out.measurements;

  const comb = tracePointsOf(view, 'comb');
  if (comb.length >= TRACE_MIN.comb) {
    const points = orientLeftToRight(toPairs(comb));
    const sampled = samplePlanCurve(fromPairs(points), { units });
    const along = arcLength(sampled);
    const chord = chordLength(sampled);
    out.curves.crest = { points, alongLength: along, chord };
    push(M, 'crest.length', along, 'top');
    out.checks.push({
      key: 'check.crestChord',
      label: 'comb chord, tip to tip (what the front view spans)',
      value: chord,
      kind: 'length',
      source: 'top',
    });
  }

  if (hasArmbow(project, template)) {
    const bow = tracePointsOf(view, 'armbow');
    if (bow.length >= TRACE_MIN.armbow) {
      const points = orientLeftToRight(toPairs(bow));
      // The gate runs on the POINTS THAT WOULD BE STORED, with the renderer's
      // own rule (schema.js), before anything is derived from them: whatever
      // this accepts, the renderer accepts. A rejected trace leaves the curve
      // untraced — the template's shape stands and the trust banner says so.
      if (!bowOpensForward(points)) {
        out.notes.push(BOW_RETRACE_NOTE);
      } else {
        const sampled = samplePlanCurve(fromPairs(points), { units });
        const box = extents(sampled);
        const tipZ = (sampled[0].y + sampled[sampled.length - 1].y) / 2;
        out.curves.bow = {
          points,
          span: chordLength(sampled),
          apexDepth: box.maxY - tipZ,
          alongLength: arcLength(sampled),
        };
        // Unlike the comb, nothing in the schedule measures a bow in its own
        // plane (the front view's inside-arm clicks belong to BOARD arms and are
        // filtered out for a bow), so there is no in-plane size to correct it
        // with — only the honest warning that everything derived from this
        // curve is magnified. Adding a landmark for it is a v0.3 design call.
        out.notes.push(BOW_TOP_SCALE_NOTE);
      }
    }
  }

  const outline = tracePointsOf(view, 'seatOutline');
  if (outline.length >= TRACE_MIN.seatOutline) {
    const points = toPairs(outline);
    out.curves.seatPlan = { points };
    if (selfIntersects(fromPairs(points), { closed: true })) {
      out.notes.push('The traced seat outline crosses itself — the drawing still renders, but that trace wants another look.');
    }
  }
}

/**
 * Left tip first (SPEC.md traces both the comb and the bow that way). Only the
 * ORDER is normalised, never a point: a curve clicked right-to-left is the same
 * curve, but the renderer labels its tips from the stored order.
 */
function orientLeftToRight(pairs) {
  if (pairs.length < 2) return pairs;
  return pairs[0][0] <= pairs[pairs.length - 1][0] ? pairs : pairs.slice().reverse();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtShort(v) { return (Math.round(v * 100) / 100).toString(); }

// ---------------------------------------------------------------------------
// The field registry — what the spec table shows and what pins write to
// ---------------------------------------------------------------------------

const legsIn = (spec, group) => spec.legs.filter((l) => l.id.startsWith(`${group}-`));
const legPair = (spec, group) => [
  spec.legs.find((l) => l.id === `${group}-left`),
  spec.legs.find((l) => l.id === `${group}-right`),
];

const len = 'length';
const ang = 'angle';
const bool = 'boolean';
const isBow = (s) => Boolean(s.arms) && s.arms.style === 'bow';
const isBoard = (s) => Boolean(s.arms) && s.arms.style !== 'bow';

export const FIELDS = [
  { key: 'seat.width', group: 'seat', label: 'seat width', kind: len, solvedIn: 'front + top',
    write: (s, v) => { s.seat.width = v; }, read: (s) => s.seat.width },
  { key: 'seat.depth', group: 'seat', label: 'seat depth', kind: len, solvedIn: 'side + top',
    write: (s, v) => { s.seat.depth = v; }, read: (s) => s.seat.depth },
  { key: 'seat.thickness', group: 'seat', label: 'seat thickness', kind: len, solvedIn: 'side',
    write: (s, v) => { s.seat.thickness = v; }, read: (s) => s.seat.thickness },
  { key: 'seat.heightFront', group: 'seat', label: 'seat height, front', kind: len, solvedIn: 'side',
    write: (s, v) => { s.seat.heightFront = v; }, read: (s) => s.seat.heightFront },
  { key: 'seat.heightBack', group: 'seat', label: 'seat height, back', kind: len, solvedIn: 'side',
    write: (s, v) => { s.seat.heightBack = v; }, read: (s) => s.seat.heightBack },
  { key: 'seat.plan.backWidth', group: 'seat', label: 'seat width at the back', kind: len, solvedIn: 'top',
    applies: (s) => s.seat.plan.type === 'trapezoid',
    write: (s, v) => { s.seat.plan.backWidth = v; }, read: (s) => s.seat.plan.backWidth },
  { key: 'seat.plan.backRadius', group: 'seat', label: 'back arc radius', kind: len, solvedIn: null,
    applies: (s) => s.seat.plan.type === 'd',
    write: (s, v) => { s.seat.plan.backRadius = v; }, read: (s) => s.seat.plan.backRadius },

  { key: 'legs.front.rake', group: 'legs', label: 'front leg rake', kind: ang, solvedIn: 'side',
    write: (s, v) => legsIn(s, 'front').forEach((l) => { l.rake = v; }),
    read: (s) => legsIn(s, 'front')[0].rake },
  { key: 'legs.back.rake', group: 'legs', label: 'back leg rake', kind: ang, solvedIn: 'side',
    write: (s, v) => legsIn(s, 'back').forEach((l) => { l.rake = v; }),
    read: (s) => legsIn(s, 'back')[0].rake },
  // Splay is never solved in phase 2 (rake-only solver) — these rows exist so
  // a bevel-gauge value can be typed in. One number per pair; the renderer's
  // outboard sign draws both feet kicked out (geometry.js).
  { key: 'legs.front.splay', group: 'legs', label: 'front leg splay', kind: ang, solvedIn: null,
    write: (s, v) => legsIn(s, 'front').forEach((l) => { l.splay = v; }),
    read: (s) => legsIn(s, 'front')[0].splay },
  { key: 'legs.back.splay', group: 'legs', label: 'back leg splay', kind: ang, solvedIn: null,
    write: (s, v) => legsIn(s, 'back').forEach((l) => { l.splay = v; }),
    read: (s) => legsIn(s, 'back')[0].splay },
  { key: 'legs.front.mortise.x', group: 'legs', label: 'front mortise, off centreline', kind: len, solvedIn: 'top',
    write: (s, v) => { const [l, r] = legPair(s, 'front'); l.mortise.x = -Math.abs(v); r.mortise.x = Math.abs(v); },
    read: (s) => Math.abs(legPair(s, 'front')[1].mortise.x) },
  { key: 'legs.front.mortise.z', group: 'legs', label: 'front mortise, behind seat front', kind: len, solvedIn: 'top',
    write: (s, v) => legsIn(s, 'front').forEach((l) => { l.mortise.z = v; }),
    read: (s) => legsIn(s, 'front')[0].mortise.z },
  { key: 'legs.back.mortise.x', group: 'legs', label: 'back mortise, off centreline', kind: len, solvedIn: 'top',
    write: (s, v) => { const [l, r] = legPair(s, 'back'); l.mortise.x = -Math.abs(v); r.mortise.x = Math.abs(v); },
    read: (s) => Math.abs(legPair(s, 'back')[1].mortise.x) },
  { key: 'legs.back.mortise.z', group: 'legs', label: 'back mortise, behind seat front', kind: len, solvedIn: 'top',
    write: (s, v) => legsIn(s, 'back').forEach((l) => { l.mortise.z = v; }),
    read: (s) => legsIn(s, 'back')[0].mortise.z },
  { key: 'legs.section', group: 'legs', label: 'leg section at the seat', kind: len, solvedIn: null,
    write: (s, v) => s.legs.forEach((l) => { l.section = v; }), read: (s) => s.legs[0].section },
  { key: 'legs.sectionFoot', group: 'legs', label: 'leg section at the floor', kind: len, solvedIn: null,
    applies: (s) => s.legs[0].sectionFoot !== undefined,
    write: (s, v) => s.legs.forEach((l) => { l.sectionFoot = v; }), read: (s) => s.legs[0].sectionFoot },
  { key: 'legs.postDiameter', group: 'legs', label: 'post diameter above the seat', kind: len, solvedIn: null,
    applies: (s) => s.legs[0].postDiameter !== undefined,
    write: (s, v) => s.legs.forEach((l) => { l.postDiameter = v; }), read: (s) => s.legs[0].postDiameter },

  { key: 'sticks.count', group: 'sticks', label: 'stick count', kind: 'count', solvedIn: null,
    write: (s, v) => { s.sticks.count = Math.max(2, Math.round(v)); }, read: (s) => s.sticks.count },
  { key: 'sticks.spread', group: 'sticks', label: 'outer stick spread', kind: len, solvedIn: 'front + top',
    write: (s, v) => { s.sticks.spread = v; }, read: (s) => s.sticks.spread },
  { key: 'sticks.rowZ', group: 'sticks', label: 'stick row, behind seat front', kind: len, solvedIn: 'top',
    write: (s, v) => { s.sticks.rowZ = v; }, read: (s) => s.sticks.rowZ },
  { key: 'sticks.lean', group: 'sticks', label: 'stick lean from vertical', kind: ang, solvedIn: 'side',
    write: (s, v) => { s.sticks.lean = v; }, read: (s) => s.sticks.lean },
  { key: 'sticks.diameter', group: 'sticks', label: 'stick diameter', kind: len, solvedIn: null,
    write: (s, v) => { s.sticks.diameter = v; }, read: (s) => s.sticks.diameter },
  // A joint, not a dimension — but it changes what the drawing shows (wedged
  // tenon tops out the crest, or a clean top), so it belongs in the table with
  // everything else the drawing uses. Pins are numbers, so it stores 1 / 0.
  { key: 'sticks.throughCrest', group: 'sticks', label: 'stick tenons at the crest', kind: bool, solvedIn: null,
    trueLabel: 'through, wedged on top', falseLabel: 'blind — stopped inside',
    write: (s, v) => { s.sticks.throughCrest = Boolean(v); },
    read: (s) => (s.sticks.throughCrest ? 1 : 0) },

  { key: 'crest.length', group: 'crest', label: 'crest length (along the curve)', kind: len, solvedIn: 'front + top',
    write: (s, v) => { s.crest.length = v; }, read: (s) => s.crest.length },
  { key: 'crest.height', group: 'crest', label: 'crest board height', kind: len, solvedIn: 'side',
    write: (s, v) => { s.crest.height = v; }, read: (s) => s.crest.height },
  { key: 'crest.thickness', group: 'crest', label: 'crest thickness', kind: len, solvedIn: null,
    write: (s, v) => { s.crest.thickness = v; }, read: (s) => s.crest.thickness },
  { key: 'crest.bottomAboveSeat', group: 'crest', label: 'seat to crest bottom', kind: len, solvedIn: 'side',
    write: (s, v) => { s.crest.bottomAboveSeat = v; }, read: (s) => s.crest.bottomAboveSeat },

  { key: 'arms.aboveSeat', group: 'arms', label: 'seat to arm top', kind: len, solvedIn: 'side',
    applies: (s) => Boolean(s.arms),
    write: (s, v) => { s.arms.aboveSeat = v; }, read: (s) => s.arms.aboveSeat },
  { key: 'arms.boardWidth', group: 'arms', label: 'arm board width', kind: len, solvedIn: null,
    applies: isBoard,
    write: (s, v) => { s.arms.boardWidth = v; }, read: (s) => s.arms.boardWidth },
  { key: 'arms.thickness', group: 'arms', label: 'arm thickness', kind: len, solvedIn: null,
    applies: isBoard,
    write: (s, v) => { s.arms.thickness = v; }, read: (s) => s.arms.thickness },
  { key: 'arms.length', group: 'arms', label: 'arm board length', kind: len, solvedIn: null,
    applies: (s) => Boolean(s.arms) && s.arms.style === 'end-boards',
    write: (s, v) => { s.arms.length = v; }, read: (s) => s.arms.length },
  // v0.2 armbow. The bow's span, apex and tips are all derived from the traced
  // curve (SPEC.md stores none of them), so the only numbers to type are the
  // stock section and the short spindles under it.
  { key: 'arms.bow.section', group: 'arms', label: 'bow stock section', kind: len, solvedIn: null,
    applies: isBow,
    write: (s, v) => { s.arms.bow.section = v; }, read: (s) => s.arms.bow.section },
  { key: 'arms.bow.spindles.count', group: 'arms', label: 'spindles under the bow', kind: 'count', solvedIn: null,
    applies: isBow,
    write: (s, v) => { s.arms.bow.spindles.count = Math.max(0, Math.round(v)); },
    read: (s) => s.arms.bow.spindles.count },
  { key: 'arms.bow.spindles.diameter', group: 'arms', label: 'spindle diameter', kind: len, solvedIn: null,
    applies: isBow,
    write: (s, v) => { s.arms.bow.spindles.diameter = v; },
    read: (s) => s.arms.bow.spindles.diameter },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const GROUP_ORDER = ['seat', 'legs', 'sticks', 'crest', 'arms'];
export const GROUP_LABEL = {
  seat: 'Seat', legs: 'Legs', sticks: 'Sticks', crest: 'Crest', arms: 'Arms',
};

/**
 * Fields whose value is a plain fact of the template, shown read-only.
 * `sticks.throughCrest` used to live here; it is an editable row now (and a
 * Photos-step question), so listing it here as well would say "template" about
 * something the user may have answered.
 */
export function templateFacts(spec) {
  const facts = [
    ['seat plan', spec.seat.plan.type === 'outline'
      ? `outline, traced (${spec.seat.plan.points.length} points)` : spec.seat.plan.type],
    ['legs through the seat', spec.legs[0].throughSeat ? 'yes' : 'no'],
    ['legs through the arm', spec.legs[0].throughArm ? 'yes' : 'no'],
    ['leg tenons wedged', spec.legs[0].wedged ? 'yes' : 'no'],
    ['sticks planed flat at the front', spec.sticks.flatsPlanedFront ? 'yes' : 'no'],
    ['crest parallels the', spec.crest.tiltRef],
    ['crest live edge', spec.crest.liveEdge ? 'yes' : 'no'],
  ];
  if (spec.arms && spec.arms.style === 'bow') {
    facts.push(['arm style', 'bow — a steam-bent armbow with short spindles']);
  } else if (spec.arms) {
    facts.push(['arm style', spec.arms.style]);
    facts.push(['arm flush with the seat front', spec.arms.flushWithSeatFront ? 'yes' : 'no']);
  } else {
    facts.push(['arms', 'none']);
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Curves — what the Spec table shows about a traced (or template) curve
// ---------------------------------------------------------------------------

/**
 * curveProvenance(spec, curves, template)
 *   -> [{ key, trace, label, shortName, source, origin, count, advice }]
 *
 * EVERY curve the assembled spec actually carries, and where its SHAPE came
 * from. This is the curve half of the trust surface, and it is deliberately
 * driven by the spec rather than by the traces: a curve that is IN the drawing
 * is a claim about the chair, however it got there.
 *
 *   source 'measured'  the points came from a usable trace
 *   source 'template'  they came from the template's own curve ('template') or
 *                      from a shape this app invented for a chair that has none
 *                      ('default' — defaultBowCurve). Both are the template
 *                      impersonating output if nothing says otherwise.
 *
 * A straight comb has no `planCurve` and therefore no row: there is no shape to
 * be wrong about. `advice` is the plain-language line the banner prints, and it
 * names the step that can fix it (curves are traced on Landmarks and read-only
 * everywhere else).
 */
export function curveProvenance(spec, curves = {}, template = null) {
  const out = [];
  const add = (key, trace, label, shortName, traced, fromTemplate) => {
    const source = traced ? 'measured' : 'template';
    const origin = traced ? 'traced' : (fromTemplate ? 'template' : 'default');
    out.push({
      key,
      trace,
      label,
      shortName,
      source,
      origin,
      advice: traced ? null
        : `${shortName} is ${origin === 'default' ? 'a stock guess' : 'the template’s shape'}, not your chair’s — trace it on the top view (Landmarks step).`,
    });
  };
  if (spec.crest.planCurve) {
    add('crest.planCurve', 'comb', 'comb centreline, in plan', 'the comb’s curve',
      Boolean(curves.crest), !template || Boolean(template.crest.planCurve));
  }
  if (spec.arms && spec.arms.style === 'bow') {
    add('arms.bow.planCurve', 'armbow', 'arm bow centreline, in plan', 'the arm bow’s shape',
      Boolean(curves.bow),
      !template || Boolean(template.arms && template.arms.style === 'bow'));
  }
  if (spec.seat.plan.type === 'outline') {
    add('seat.plan.points', 'seatOutline', 'seat outline', 'the seat’s outline',
      Boolean(curves.seatPlan),
      !template || template.seat.plan.type === 'outline');
  }
  return out;
}

/**
 * curveFacts(spec, curves) -> [{ key, label, source, count, facts: [[k, v]] }]
 *
 * The same rows as curveProvenance, plus the derived numbers the Spec table
 * shows. Read-only: a curve is not a number, so it cannot be typed over.
 *
 * The derived numbers are the ones a chairmaker would ask for: the chord (what
 * the front elevation spans), a fitted radius when a circle GENUINELY fits
 * within a 1/16 in band, "varies" when it does not, and the apex depth.
 */
export function curveFacts(spec, curves = {}, template = null) {
  const units = spec.meta.units;
  const tol = fitToleranceFor(units);
  const out = [];
  const describe = (pairs, { closed = false } = {}) => {
    const sampled = samplePlanCurve(fromPairs(pairs), { units, closed });
    const box = extents(sampled);
    const facts = [];
    if (closed) {
      facts.push(['width across', round4(box.width)]);
      facts.push(['depth front to back', round4(box.height)]);
      facts.push(['around the outline', round4(arcLength(sampled, { closed: true }))]);
    } else {
      facts.push(['along the curve', round4(arcLength(sampled))]);
      facts.push(['chord, tip to tip', round4(chordLength(sampled))]);
      facts.push(['apex depth', round4(box.height)]);
      const fit = fitCircle(sampled, tol);
      // Same three-way rule the drawing prints (renderer/src/panels.js): a
      // fitted radius, "straight" for a trace that never leaves its own chord,
      // "varies" only for a curve that really is irregular.
      facts.push(['radius', radiusFact(sampled, fit, tol)]);
    }
    return facts;
  };

  const pointsFor = {
    'crest.planCurve': () => spec.crest.planCurve.points,
    'arms.bow.planCurve': () => spec.arms.bow.planCurve.points,
    'seat.plan.points': () => spec.seat.plan.points,
  };
  for (const row of curveProvenance(spec, curves, template)) {
    const pairs = pointsFor[row.key]();
    const closed = row.key === 'seat.plan.points';
    out.push({
      key: row.key,
      label: row.label,
      source: row.source,
      origin: row.origin,
      count: pairs.length,
      facts: describe(pairs, { closed }),
    });
  }
  return out;
}

function radiusFact(sampled, fit, tol) {
  if (fit && fit.fits) return round4(fit.r);
  if (maxChordDeviation(sampled) <= tol) return 'straight (no arc to lay out)';
  return 'varies (no single arc fits)';
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * The documented starting points for an armbow the template does not have.
 * Every one of them is editable in the Spec table and none is ever presented as
 * measured — they exist so that answering "yes, an arm bow" on a template
 * without one still renders a chair.
 */
export const BOW_DEFAULTS = Object.freeze({
  aboveSeatIn: 9,        // seat top -> arm top; the usual sitting-arm height
  sectionIn: 1.25,       // steam-bent stock, round-ish
  spindles: 8,           // short spindles seat -> bow, both sides together
  halfSpanFrac: 0.40,    // of the seat width, per tip
  tipZFrac: 0.10,        // of the seat depth, how far back the tips land
  apexZFrac: 0.88,       // of the seat depth, how far back the apex reaches
  points: 9,             // sampled points in the generated curve
});

/**
 * A plain U-shaped bow, sized off the seat it sits on: an exact circular arc
 * through the two tips and the apex, sampled at a fixed count. Deterministic,
 * unit-agnostic (it is all fractions of the seat), and shaped like a bow rather
 * than like an assumption about anyone's chair.
 */
export function defaultBowCurve(seat) {
  const half = BOW_DEFAULTS.halfSpanFrac * seat.width;
  const tipZ = BOW_DEFAULTS.tipZFrac * seat.depth;
  const apexZ = BOW_DEFAULTS.apexZFrac * seat.depth;
  const sagitta = apexZ - tipZ;
  const r = (half * half + sagitta * sagitta) / (2 * sagitta);
  const cz = apexZ - r;
  const a0 = Math.atan2(-half, tipZ - cz);
  const a1 = Math.atan2(half, tipZ - cz);
  const n = BOW_DEFAULTS.points;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    pts.push([round4(r * Math.sin(a)), round4(cz + r * Math.cos(a))]);
  }
  return pts;
}

/**
 * Turn whatever arms the template has into a v0.2 bow, per the Photos answer.
 * Anything the template already knows is kept (a bow template keeps its own
 * curve and section; a board-armed template keeps its measured arm height);
 * everything else comes from BOW_DEFAULTS or from the answered spindle count.
 */
function bowArms(spec, template, project, curves) {
  const units = spec.meta.units;
  const t = template.arms && template.arms.style === 'bow' ? template.arms : null;
  const templateArms = template.arms || null;
  const traced = curves.bow ? clone(curves.bow.points) : null;
  const points = traced
    || (t ? clone(t.bow.planCurve.points) : null);
  const count = Number.isFinite(project.armSpindleCount)
    ? Math.max(0, Math.round(project.armSpindleCount))
    : (t ? t.bow.spindles.count : BOW_DEFAULTS.spindles);
  return {
    arms: {
      style: 'bow',
      aboveSeat: templateArms ? templateArms.aboveSeat : inUnits(BOW_DEFAULTS.aboveSeatIn, units),
      bow: {
        section: t ? t.bow.section : inUnits(BOW_DEFAULTS.sectionIn, units),
        // Provisional when generated: the real one is drawn off the SOLVED seat
        // once the measurements are in (see assembleSpec).
        planCurve: { points: points || defaultBowCurve(spec.seat) },
        spindles: {
          count,
          diameter: t ? t.bow.spindles.diameter : spec.sticks.diameter,
        },
      },
    },
    generatedCurve: !points,
  };
}

/**
 * assembleSpec(template, values, project, curves) -> spec
 *
 * Template first (so an incomplete session always renders something), then the
 * two Photos-step ANSWERS, then traced curves, then measured/reconciled values,
 * then the user's pins — the tape always wins.
 *
 * The answers run before the field registry on purpose: every `applies()`
 * predicate asks the spec what shape it is, so the chair has to know whether it
 * has arms (and of what kind) before a single number is written into it.
 */
export function assembleSpec(template, values, project, curves = {}) {
  const spec = clone(template);
  spec.meta = { ...spec.meta, units: project.units };
  if (project.name && project.name.trim()) spec.meta.name = project.name.trim();
  if (project.notes && project.notes.trim()) spec.meta.notes = project.notes.trim();

  // Stick count is a step-1 answer, not a measurement.
  if (Number.isFinite(project.stickCount) && project.stickCount >= 2) {
    spec.sticks.count = Math.round(project.stickCount);
  }

  // --- the two answers ------------------------------------------------------
  const armStyle = resolveArmStyle(project, template);
  let generatedBowCurve = false;
  if (armStyle === null) {
    spec.arms = null;
  } else if (armStyle === 'bow') {
    const built = bowArms(spec, template, project, curves);
    spec.arms = built.arms;
    generatedBowCurve = built.generatedCurve;
    // A bent bow carries no leg (SPEC.md v0.2), so a template's "legs through
    // the arm" cannot survive the answer — it is not a fact about this chair
    // any more, and leaving it makes the renderer warn on every re-draw.
    spec.legs.forEach((l) => { l.throughArm = false; });
  }
  const throughCrest = resolveThroughCrest(project);
  if (throughCrest !== null) spec.sticks.throughCrest = throughCrest;

  // --- traced curves --------------------------------------------------------
  // Stored exactly as traced (SPEC.md forbids resampling on load); the renderer
  // smooths them at draw time with its own fixed parameters.
  if (curves.seatPlan) {
    spec.seat.plan = { type: 'outline', points: clone(curves.seatPlan.points) };
  } else if (values['seat.plan.backWidth'] && spec.seat.plan.type === 'rect') {
    // A trapezoid only exists once the top view says so.
    spec.seat.plan = { type: 'trapezoid', backWidth: values['seat.plan.backWidth'].value };
  }
  if (curves.crest) {
    spec.crest.planCurve = { points: clone(curves.crest.points) };
  }

  for (const field of FIELDS) {
    const resolved = values[field.key];
    if (!resolved || !Number.isFinite(resolved.value)) continue;
    if (field.applies && !field.applies(spec)) continue;
    field.write(spec, resolved.value);
  }

  // Pins last.
  for (const [key, raw] of Object.entries(project.pins || {})) {
    const field = FIELD_BY_KEY[key];
    const v = Number(raw);
    if (!field || !Number.isFinite(v)) continue;
    if (field.applies && !field.applies(spec)) continue;
    field.write(spec, v);
  }

  // A generated bow shape follows the SOLVED seat, not the template's: it is a
  // placeholder for a curve nobody traced, and a placeholder that ignores the
  // measured seat would draw a bow hanging off the side of the chair.
  if (generatedBowCurve && spec.arms && spec.arms.style === 'bow') {
    spec.arms.bow.planCurve = { points: defaultBowCurve(spec.seat) };
  }

  // Phase 2 solves rake only.
  spec.legs.forEach((l) => { if (!Number.isFinite(l.splay)) l.splay = 0; });
  return spec;
}

/** Guard rails so a half-finished session still renders (renderer throws otherwise). */
export function repairSpec(spec, template) {
  const notes = [];
  const s = spec;
  const fixNum = (path, get, set, fallback, why) => {
    const v = get();
    if (!Number.isFinite(v) || v <= 0) { set(fallback); notes.push(`${path}: ${why}`); }
  };
  fixNum('seat.width', () => s.seat.width, (v) => { s.seat.width = v; }, template.seat.width, 'not measured yet, using the template');
  fixNum('seat.depth', () => s.seat.depth, (v) => { s.seat.depth = v; }, template.seat.depth, 'not measured yet, using the template');
  if (s.seat.heightBack > s.seat.heightFront) {
    s.seat.heightBack = s.seat.heightFront;
    notes.push('seat.heightBack: clamped to the front height (the schema requires a level or back-sloping seat)');
  }
  if (s.seat.thickness >= s.seat.heightFront) {
    s.seat.thickness = Math.min(template.seat.thickness, s.seat.heightFront * 0.2);
    notes.push('seat.thickness: clamped below the seat height');
  }
  const maxSpread = Math.min(s.crest.length, s.seat.width) * 0.98;
  if (s.sticks.spread >= maxSpread) {
    s.sticks.spread = maxSpread;
    notes.push('sticks.spread: clamped inside the crest length and the seat width (the schema requires both)');
  }
  return { spec: s, notes };
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

const FIELD_KIND = Object.fromEntries(FIELDS.map((f) => [f.key, f.kind === 'angle' ? 'angle' : 'length']));

/**
 * solveProject(project, template) ->
 *   { spec, values, conflicts, checks, notes, measurements, repairs, coverage }
 */
export function solveProject(project, template) {
  const side = measureSide(project, template);
  const front = measureFront(project);
  const top = measureTop(project, template);
  const curves = top.curves || {};

  const measurements = {};
  // Deterministic field order: side, then front, then top.
  for (const part of [side, front, top]) {
    for (const [field, entries] of Object.entries(part.measurements)) {
      if (!measurements[field]) measurements[field] = [];
      measurements[field].push(...entries);
    }
  }

  const notes = [...side.notes, ...front.notes, ...top.notes];
  const checks = [...side.checks, ...front.checks, ...top.checks];

  applyCombSize(measurements, checks, notes, curves, project.units);
  applyOutlineDatum(measurements, checks, notes, curves, project.units);

  const { values, conflicts } = reconcile(
    measurements, project.units, project.choices || {}, FIELD_KIND,
  );

  const assembled = assembleSpec(template, values, project, curves);
  const { spec, notes: repairs } = repairSpec(assembled, template);

  const solvable = FIELDS.filter((f) => f.solvedIn && (!f.applies || f.applies(spec)));
  const coverage = {
    solvable: solvable.length,
    solved: solvable.filter((f) => values[f.key]).length,
  };
  const trust = trustReport(spec, values, project, template, curves);

  return {
    spec, values, conflicts, checks, notes, measurements, repairs, coverage, curves, trust,
  };
}

/**
 * THE comb's size, once the comb has been traced.
 *
 * Two things are true at once and used to fight each other:
 *
 *   1. The front elevation spans the CHORD, tip to tip; the trace gives the
 *      length ALONG the curve. They are not two readings of one number, so
 *      reconciling them raises a conflict that is really just geometry — the
 *      front reading has always been demoted to a cross-check here (D6).
 *   2. The trace is magnified. The top view is rectified on the SEAT plane and
 *      the comb stands well above it, closer to the camera, so its every
 *      dimension in that view is stretched by an unmeasured factor.
 *
 * D6's shape-vs-size split settles both at once. Arc ÷ chord is a pure SHAPE
 * ratio — magnify a curve uniformly and the ratio does not move — so:
 *
 *      crest.length  =  front-view chord  ×  (trace arc ÷ trace chord)
 *
 * shape from the trace, size from the one view that sees the comb square on and
 * in its own plane. The trace itself is stored exactly as clicked (D5); the
 * renderer scales that shape to the stated length about its arc midpoint, which
 * is precisely the correction, applied to the whole curve.
 *
 * Without a usable front chord the trace's own length stands — it is still the
 * user's own measurement of their own chair, just a stretched one — and the
 * note says so and says which two clicks would fix it. A SEEDED front chord
 * does not count as usable: it is the template's crest length, and swapping a
 * stretched measurement for a template number is not an improvement.
 */
function applyCombSize(measurements, checks, notes, curves, units) {
  const traced = curves.crest;
  const entries = measurements['crest.length'] || [];
  if (!traced || !entries.length) return;
  const fromFront = entries.filter((e) => e.source === 'front');
  const usable = fromFront.find((e) => !e.seeded && e.value > 0);
  const { alongLength: along, chord } = traced;

  // Whatever happens next, the front reading is not a peer of the trace.
  measurements['crest.length'] = entries.filter((e) => e.source !== 'front');

  if (usable && chord > 0 && along > 0) {
    const value = usable.value * (along / chord);
    measurements['crest.length'] = [{ value, source: 'front+top' }];
    checks.push({
      key: 'check.combLengthTop',
      label: 'comb length as the top view alone reads it (a part above the seat reads large)',
      value: along,
      kind: 'length',
      source: 'top',
    });
    if (!compare(along, value, units).agree) {
      const stretch = Math.round(((along / value) - 1) * 100);
      notes.push(`The top view reads the comb ${fmtShort(along)} long, the front view’s two crest-end clicks make it ${fmtShort(value)}${stretch > 0 ? ` — about ${stretch}% longer` : ''}. That is what a part standing above the seat does in a photo rectified on the seat plane: it sits closer to the camera and photographs big. The drawing takes the comb’s SIZE from the front view and its SHAPE from your trace.`);
    }
    return;
  }

  for (const e of fromFront) {
    checks.push({
      key: 'check.crestChordFront',
      label: 'crest, end to end in the front view (the chord of the curve)',
      value: e.value,
      kind: 'length',
      source: 'front',
    });
  }
  notes.push(COMB_TOP_SCALE_NOTE);
}

/**
 * THE seat's fore-aft datum, applied to every view that reads it.
 *
 * SPEC.md puts the chair-frame origin on the seat's FRONT EDGE. When a seat
 * outline has been traced, `topFrame` already moves the top view's z origin to
 * the frontmost traced point — the real front edge of a shaped seat. This is
 * the other half of that decision, and it follows the rule the comb chord
 * already set: WHEN TWO VIEWS MEASURE DIFFERENT THINGS, THE ONE THAT MEASURES
 * THE RIGHT THING WINS AND THE OTHER BECOMES A CROSS-CHECK. Reconciling them
 * would be averaging a number with a different number.
 *
 * A forward-bellying seat is the case that matters. The outline's frontmost
 * point is the belly, at the centreline; the side photo shows the chair's SIDE,
 * where the seat begins `dz` further back. So:
 *
 *   seat.depth      the traced extents win outright. The side reading is a
 *                   check row, not a second source — it used to be averaged
 *                   with the trace inside the reconcile window (18.000 and
 *                   18.350 quietly became 18.175, a number neither view read).
 *   heightFront     the side view clicked the seat top at z = dz, not at z = 0.
 *                   On a back-sloping seat that reads LOW by dz × slope, so the
 *                   reading is carried forward to the datum before it is used.
 *                   Small (thousandths on a real chair) but free and correct.
 *   heightBack      already at the back extent both views agree on — untouched.
 *
 * The conflict chooser still exists for everything else, and for any pair that
 * disagrees beyond the window this leaves a note saying which view won.
 */
function applyOutlineDatum(measurements, checks, notes, curves, units) {
  if (!curves.seatPlan) return;
  const depths = measurements['seat.depth'] || [];
  const fromSide = depths.filter((e) => e.source === 'side');
  const fromTop = depths.find((e) => e.source === 'top');
  if (!fromTop || !fromSide.length) return;

  measurements['seat.depth'] = depths.filter((e) => e.source !== 'side');
  for (const e of fromSide) {
    checks.push({
      key: 'check.seatDepthSide',
      label: 'seat depth in the side view (front corner to back corner)',
      value: e.value,
      kind: 'length',
      source: 'side',
    });
  }

  const dz = fromTop.value - fromSide[0].value;
  if (!compare(fromTop.value, fromSide[0].value, units).agree) {
    notes.push(`The side view reads the seat ${fmtShort(Math.abs(dz))} ${dz >= 0 ? 'shallower' : 'deeper'} than the traced outline. The outline wins — it carries the seat's front-edge datum — and the side reading is kept below as a cross-check.`);
  }
  if (dz < -1e-9) {
    notes.push('The side view reads the seat DEEPER than the traced outline, which means the outline missed the front or the back of the seat. Worth another look at that trace.');
    return;
  }
  if (!(dz > 0) || !(fromTop.value > 0)) return;

  // Carry the front-corner height forward to the datum, along the seat's own
  // slope. Nothing else in the side view is datum-relative: thickness is a
  // local drop and the rakes are angles.
  const hb = (measurements['seat.heightBack'] || []).find((e) => e.source === 'side');
  const hf = (measurements['seat.heightFront'] || []).filter((e) => e.source === 'side');
  if (!hb || !hf.length) return;
  const slope = (hf[0].value - hb.value) / fromTop.value;
  if (!(slope > 0)) return;
  for (const e of hf) e.value += slope * dz;
}

/**
 * Which fields the Photos-step questions ANSWER. An answered question is not a
 * measurement, but it is not the template impersonating one either — it is the
 * user telling the app a fact about their chair, and the badge says so.
 */
const ANSWERED_BY = {
  'sticks.throughCrest': (p) => resolveThroughCrest(p) !== null,
  'arms.bow.spindles.count': (p) => Number.isFinite(p.armSpindleCount),
  // The stick count is a Photos-step answer too (assembleSpec writes it into
  // the spec), so leaving it out badged a number the user typed as "template".
  //
  // It needs its own flag rather than a null test because, unlike the other two
  // answers, `stickCount` has never been nullable — a fresh project starts at
  // the template's count, and counting THAT as an answer would put a 1 in front
  // of a user who has done nothing, which is the red state quietly disappearing.
  // store.js sets `stickCountAnswered` when the user actually changes it.
  'sticks.count': (p) => Boolean(p.stickCountAnswered),
};

/**
 * Where a field's number came from, for the spec table's source badge.
 *
 * 'seeded' outranks every solved source: a value the solver derived from a
 * landmark still sitting where the TEMPLATE put it is a template position that
 * has been through some arithmetic, and calling it "measured" is the lie D10
 * exists to stop. A pin still wins, because a typed number replaces the value
 * outright — the tape does not care what the landmark under it was.
 */
export function sourceOf(key, values, pins, project) {
  if (pins && Object.prototype.hasOwnProperty.call(pins, key)) return 'edited';
  const r = values[key];
  if (r) return r.seeded ? 'seeded' : r.source; // measured | reconciled | chosen | conflict
  if (project && ANSWERED_BY[key] && ANSWERED_BY[key](project)) return 'answered';
  return 'template';
}

/**
 * Sources that mean "this number came from your chair", not from the template.
 *
 * 'seeded' is deliberately NOT on this list, and 'template' never was: both
 * mean the number is the template's, they differ only in how it got there
 * (carried over untouched, or solved out of a template-placed landmark).
 */
export const MEASURED_SOURCES = Object.freeze([
  'measured', 'reconciled', 'chosen', 'conflict', 'edited', 'answered',
]);

/**
 * One phrasing for the count, everywhere it is rendered.
 *
 * "measured" was a lie in both directions: a typed value and an answered
 * question are not measurements, and a traced curve is one but was not being
 * counted. This says what the count actually is — the share of this drawing
 * that came from the user rather than from the template.
 */
export const COUNT_PHRASE = 'from your chair or your answers';

/**
 * trustReport(spec, values, project, template, curves) -> the banner state.
 *
 * ANNOTATOR.md, phase 3b: "the template must never impersonate output". The
 * count is over everything the drawing actually uses:
 *
 *   - every field row the Spec table shows for this chair, counted as yours
 *     when it was measured, reconciled, chosen, answered or typed; plus
 *   - every CURVE the assembled spec carries — the seat outline, the comb's
 *     plan curve, the arm bow's — counted as yours only when it came from a
 *     usable trace.
 *
 * The curves belong in the denominator because on a curved chair they are most
 * of the drawing. With scalars alone, a session that measured every number and
 * traced nothing showed no banner at all while defaultBowCurve() invented the
 * whole bow on a sheet titled "measured drawing". A straight comb has no curve
 * and so no row; there is nothing there to be wrong about.
 *
 *   state 'none'      nothing at all came from your photos -> RED
 *   state 'partial'   some did -> AMBER
 *   state 'complete'  all of it did -> no banner
 */
export function trustReport(spec, values, project, template, curves = {}) {
  const measuredSet = new Set(MEASURED_SOURCES);
  const pins = (project && project.pins) || {};
  const rows = FIELDS.filter((f) => !f.applies || f.applies(spec));
  const fromTemplate = [];
  let measured = 0;
  for (const f of rows) {
    if (measuredSet.has(sourceOf(f.key, values, pins, project))) measured += 1;
    else fromTemplate.push(f.key);
  }
  const curveRows = curveProvenance(spec, curves, template);
  const untracedCurves = [];
  for (const c of curveRows) {
    if (c.source === 'measured') measured += 1;
    else {
      fromTemplate.push(c.key);
      untracedCurves.push(c);
    }
  }
  const total = rows.length + curveRows.length;
  const templateName = (template && template.meta && template.meta.name) || 'chosen';
  const state = measured === 0 ? 'none' : (measured < total ? 'partial' : 'complete');
  const headline = state === 'none'
    ? `NOTHING MEASURED — this is the ${templateName} template, not your chair`
    : (state === 'partial'
      ? `${measured} of ${total} ${COUNT_PHRASE} — the rest is template`
      : `all ${total} ${COUNT_PHRASE}`);
  return {
    state,
    measured,
    total,
    headline,
    templateName,
    fromTemplate,
    curves: curveRows,
    // The lines the banner prints verbatim. A count cannot say "the arm bow is
    // invented"; this can, and it says where to fix it.
    untracedCurves,
    curveAdvice: untracedCurves.map((c) => c.advice),
  };
}
