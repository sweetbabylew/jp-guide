// schema.js — validate a chair spec (SPEC.md v0.1 + v0.2), apply defaults, and
// apply `overrides`. Throws Error with a path-tagged message; collects soft
// problems in `warnings` (SPEC.md says mirror-pair violations warn, never fail).
//
// v0.2 adds the planar sampled curve: `seat.plan.type "outline"`,
// `crest.planCurve`, and the `"bow"` arm style. Curves are validated as STORED
// — nothing here resamples them (SPEC.md: smoothing happens at draw time with
// fixed parameters, so that stored points always redraw identically).

import { fromPairs, extents, selfIntersects, unitScale } from './curve.js';

const LEG_IDS = ['front-left', 'front-right', 'back-left', 'back-right'];
const PLAN_TYPES = ['rect', 'trapezoid', 'd', 'outline'];
const ARM_STYLES = ['full', 'end-boards', 'bow'];
const SPEC_VERSIONS = ['0.1', '0.2'];

class SpecError extends Error {
  constructor(path, message) {
    super(`spec${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'SpecError';
    this.path = path;
  }
}

function fail(path, message) {
  throw new SpecError(path, message);
}

function req(obj, key, path) {
  if (obj === null || typeof obj !== 'object') fail(path, 'expected an object');
  if (!(key in obj) || obj[key] === undefined) {
    fail(`${path}.${key}`, 'is required');
  }
  return obj[key];
}

function numberAt(obj, key, path, { positive = true, allowNull = false } = {}) {
  const v = req(obj, key, path);
  if (v === null && allowNull) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(`${path}.${key}`, `must be a finite number (got ${JSON.stringify(v)})`);
  }
  if (positive && v <= 0) {
    fail(`${path}.${key}`, `must be > 0 (got ${v})`);
  }
  return v;
}

function boolAt(obj, key, path) {
  const v = req(obj, key, path);
  if (typeof v !== 'boolean') fail(`${path}.${key}`, `must be true or false (got ${JSON.stringify(v)})`);
  return v;
}

function stringAt(obj, key, path, allowed) {
  const v = req(obj, key, path);
  if (typeof v !== 'string' || v === '') {
    fail(`${path}.${key}`, "must be a non-empty string ('' never means null)");
  }
  if (allowed && !allowed.includes(v)) {
    fail(`${path}.${key}`, `must be one of ${allowed.map((a) => JSON.stringify(a)).join(', ')} (got ${JSON.stringify(v)})`);
  }
  return v;
}

/** Deep clone without structuredClone (kept portable across old runtimes). */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/**
 * A stored planar curve: `[[x, z], …]` pairs. SPEC.md v0.2 validation rules —
 * every point finite, no consecutive duplicates, a minimum point count per
 * member. Returns the pairs; the caller decides what the plane means.
 */
function curvePairs(pairs, path, { min, closed = false }) {
  if (!Array.isArray(pairs)) fail(path, 'must be an array of [x, z] points');
  if (pairs.length < min) {
    fail(path, `needs at least ${min} points (got ${pairs.length})`);
  }
  pairs.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) {
      fail(`${path}[${i}]`, 'must be a two-number [x, z] pair');
    }
    for (const [j, v] of p.entries()) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        fail(`${path}[${i}][${j}]`, `must be a finite number (got ${JSON.stringify(v)})`);
      }
    }
  });
  const last = closed ? pairs.length : pairs.length - 1;
  for (let i = 0; i < last; i += 1) {
    const a = pairs[i];
    const b = pairs[(i + 1) % pairs.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) {
      const why = closed && i === pairs.length - 1
        ? 'the first point must not be repeated as the last (the ring closes itself)'
        : `points ${i} and ${i + 1} are duplicates`;
      fail(path, `has consecutive duplicate points: ${why}`);
    }
  }
  return pairs;
}

/** A `{ points: [[x, z], …] }` curve object, as SPEC.md v0.2 stores them. */
function curveObject(obj, key, path, opts) {
  const c = req(obj, key, path);
  if (c === null || typeof c !== 'object' || Array.isArray(c)) {
    fail(`${path}.${key}`, 'must be an object with a "points" array');
  }
  curvePairs(req(c, 'points', `${path}.${key}`), `${path}.${key}.points`, opts);
  return c;
}

/**
 * THE bow-opens-forward gate, exported so that every producer of a bow curve
 * can apply the SAME rule this validator will apply to it.
 *
 * A v0.2 bow is a U opening forward: both tips ahead (smaller z) of the apex.
 * The rule is deliberately picky about which points play which part —
 *
 *   tipZ   the DEEPER of the two END points (a bow whose tips disagree is
 *          judged by the worse one, not by their average)
 *   apexZ  the deepest INTERIOR point (an end point cannot be its own apex)
 *
 * — because a looser version of it is worse than none: the annotator used to
 * gate the mean tip z against the max of the whole curve, which passes a trace
 * whose last tip is the deepest point of all, and the user then met a renderer
 * exception instead of a note telling them to re-trace. One rule, one place.
 *
 * `pairs` is the stored `[[x, z], …]` form. Returns true/false; it never throws,
 * so a caller can use it to DECIDE rather than to fail.
 */
export function bowOpensForward(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 3) return false;
  for (const p of pairs) {
    if (!Array.isArray(p) || !Number.isFinite(p[1])) return false;
  }
  const tipZ = Math.max(pairs[0][1], pairs[pairs.length - 1][1]);
  const apexZ = Math.max(...pairs.slice(1, -1).map((p) => p[1]));
  return apexZ > tipZ;
}

function setByPath(root, dotted, value) {
  const parts = dotted.split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (node[key] === undefined || node[key] === null || typeof node[key] !== 'object') {
      fail(`overrides["${dotted}"]`, `path segment "${parts[i]}" does not exist in the spec`);
    }
    node = node[key];
  }
  const last = /^\d+$/.test(parts[parts.length - 1])
    ? Number(parts[parts.length - 1])
    : parts[parts.length - 1];
  if (!(last in node)) {
    fail(`overrides["${dotted}"]`, `path does not exist in the spec`);
  }
  node[last] = value;
}

/**
 * validate(spec) -> { spec, warnings }
 * The returned spec is a normalised copy: overrides applied, optional fields
 * filled with their documented defaults.
 */
export function validate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('', 'must be a JSON object');
  }
  const spec = clone(input);
  const warnings = [];

  // --- overrides first, so every later check sees the pinned values ---------
  if (spec.overrides !== undefined) {
    if (spec.overrides === null || typeof spec.overrides !== 'object' || Array.isArray(spec.overrides)) {
      fail('overrides', 'must be an object of "dotted.path": number');
    }
    for (const [k, v] of Object.entries(spec.overrides)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        fail(`overrides["${k}"]`, 'must be a finite number');
      }
      setByPath(spec, k, v);
    }
  } else {
    spec.overrides = {};
  }

  // --- meta -----------------------------------------------------------------
  const meta = req(spec, 'meta', '');
  stringAt(meta, 'specVersion', 'meta');
  if (!SPEC_VERSIONS.includes(meta.specVersion)) {
    warnings.push(`meta.specVersion is "${meta.specVersion}"; this renderer implements ${SPEC_VERSIONS.join(' and ')}`);
  }
  stringAt(meta, 'name', 'meta');
  stringAt(meta, 'units', 'meta', ['in', 'mm']);
  stringAt(meta, 'family', 'meta', ['stick-chair']);
  if (meta.notes !== undefined && typeof meta.notes !== 'string') {
    fail('meta.notes', 'must be a string when present');
  }

  // --- seat ----------------------------------------------------------------
  const seat = req(spec, 'seat', '');
  numberAt(seat, 'width', 'seat');
  numberAt(seat, 'depth', 'seat');
  numberAt(seat, 'thickness', 'seat');
  numberAt(seat, 'heightFront', 'seat');
  numberAt(seat, 'heightBack', 'seat');
  if (seat.heightBack > seat.heightFront) {
    fail('seat.heightBack', `must be <= seat.heightFront (${seat.heightBack} > ${seat.heightFront}); seats slope back or are level`);
  }
  if (seat.thickness >= seat.heightFront) {
    fail('seat.thickness', 'must be less than seat.heightFront');
  }
  const plan = req(seat, 'plan', 'seat');
  stringAt(plan, 'type', 'seat.plan', PLAN_TYPES);
  if (plan.type === 'trapezoid') numberAt(plan, 'backWidth', 'seat.plan');
  if (plan.type === 'd') numberAt(plan, 'backRadius', 'seat.plan');
  if (plan.type === 'outline') {
    // v0.2 traced seat: a closed ring, >= 6 points, first point NOT repeated.
    // Self-intersection warns rather than fails — the user still gets their
    // drawing, with a note that the trace wants another look.
    const pairs = curvePairs(req(plan, 'points', 'seat.plan'), 'seat.plan.points', {
      min: 6, closed: true,
    });
    const ring = fromPairs(pairs);
    if (selfIntersects(ring, { closed: true })) {
      warnings.push('seat.plan.points crosses itself — the traced outline is not a simple polygon');
    }
    // width/depth become derived extents (SPEC.md); the stored numbers are kept
    // as a cross-check, and a big disagreement means one of the two is wrong.
    const box = extents(ring);
    const slack = 0.25 * unitScale(meta.units);
    if (Math.abs(box.width - seat.width) > slack) {
      warnings.push(`seat.width (${seat.width}) disagrees with the traced outline's width (${round2(box.width)}); the outline wins`);
    }
    if (Math.abs(box.height - seat.depth) > slack) {
      warnings.push(`seat.depth (${seat.depth}) disagrees with the traced outline's depth (${round2(box.height)}); the outline wins`);
    }
    if (Math.abs(box.minY) > slack) {
      warnings.push(`seat.plan.points starts ${round2(box.minY)} from z = 0 — the outline's front edge should sit on the seat front datum`);
    }
  }

  // --- legs ----------------------------------------------------------------
  const legs = req(spec, 'legs', '');
  if (!Array.isArray(legs) || legs.length !== 4) {
    fail('legs', `must be an array of exactly 4 legs for v0.1 (got ${Array.isArray(legs) ? legs.length : typeof legs})`);
  }
  const seen = new Set();
  legs.forEach((leg, i) => {
    const p = `legs[${i}]`;
    const id = stringAt(leg, 'id', p, LEG_IDS);
    if (seen.has(id)) fail(`${p}.id`, `duplicate leg id "${id}"`);
    seen.add(id);
    const m = req(leg, 'mortise', p);
    numberAt(m, 'x', `${p}.mortise`, { positive: false });
    numberAt(m, 'z', `${p}.mortise`, { positive: false });
    numberAt(leg, 'rake', p, { positive: false });
    numberAt(leg, 'splay', p, { positive: false });
    numberAt(leg, 'section', p);
    // Optional taper / post fields. Their defaults are applied HERE and
    // nowhere else, so everything downstream sees a fully populated leg.
    if (leg.sectionFoot !== undefined) {
      numberAt(leg, 'sectionFoot', p);
      if (leg.sectionFoot > leg.section) {
        warnings.push(`${p}.sectionFoot (${leg.sectionFoot}) is larger than section (${leg.section}) — the leg widens toward the floor`);
      }
    } else {
      leg.sectionFoot = leg.section;    // omitted = no taper
    }
    if (leg.postDiameter !== undefined) {
      numberAt(leg, 'postDiameter', p);
      if (leg.postDiameter > leg.section) {
        warnings.push(`${p}.postDiameter (${leg.postDiameter}) is larger than section (${leg.section}) — the post is fatter than the leg below the seat`);
      }
    } else {
      leg.postDiameter = leg.section;   // omitted = post is the leg section
    }
    boolAt(leg, 'throughSeat', p);
    boolAt(leg, 'throughArm', p);
    boolAt(leg, 'wedged', p);
    if (Math.abs(leg.rake) >= 89 || Math.abs(leg.splay) >= 89) {
      fail(p, 'rake/splay must be under 89° from vertical');
    }
    if (leg.mortise.z < 0 || leg.mortise.z > seat.depth) {
      warnings.push(`${p}.mortise.z (${leg.mortise.z}) is outside the seat depth 0..${seat.depth}`);
    }
    if (Math.abs(leg.mortise.x) > seat.width / 2) {
      warnings.push(`${p}.mortise.x (${leg.mortise.x}) is outside the seat half-width ${seat.width / 2}`);
    }
  });
  for (const id of LEG_IDS) {
    if (!seen.has(id)) fail('legs', `missing leg "${id}" (all four ids are required)`);
  }
  // Mirror check — warn, never fail (SPEC.md validation rules).
  //
  // SPLAY, corrected in v0.2: the sign is OUTBOARD-relative, so a mirrored pair
  // carries the SAME splay value, not the negated one v0.1 documented. The
  // negated form is still accepted in silence (v0.1 documents stay valid, and
  // every one in the wild carries splay 0, where the two forms coincide); the
  // stored sign is never rewritten, because per SPEC.md's angle conventions a
  // genuinely negative splay means that leg's foot is tucked inboard.
  for (const side of ['front', 'back']) {
    const l = legs.find((g) => g.id === `${side}-left`);
    const r = legs.find((g) => g.id === `${side}-right`);
    if (Math.abs(l.mortise.x + r.mortise.x) > 1e-6) {
      warnings.push(`${side} legs do not mirror: mortise.x ${l.mortise.x} / ${r.mortise.x}`);
    }
    if (Math.abs(l.mortise.z - r.mortise.z) > 1e-6) {
      warnings.push(`${side} legs do not mirror: mortise.z ${l.mortise.z} / ${r.mortise.z}`);
    }
    if (Math.abs(l.rake - r.rake) > 1e-6) {
      warnings.push(`${side} legs do not mirror: rake ${l.rake} / ${r.rake}`);
    }
    if (Math.abs(l.splay + r.splay) > 1e-6 && Math.abs(l.splay - r.splay) > 1e-6) {
      warnings.push(`${side} legs do not mirror: splay ${l.splay} / ${r.splay} (a mirrored pair carries the SAME splay — the sign is outboard-relative)`);
    }
  }

  // --- sticks ---------------------------------------------------------------
  const sticks = req(spec, 'sticks', '');
  numberAt(sticks, 'count', 'sticks');
  if (!Number.isInteger(sticks.count) || sticks.count < 2) {
    fail('sticks.count', `must be an integer >= 2 (got ${sticks.count})`);
  }
  numberAt(sticks, 'diameter', 'sticks');
  boolAt(sticks, 'flatsPlanedFront', 'sticks');
  numberAt(sticks, 'rowZ', 'sticks', { positive: false });
  numberAt(sticks, 'spread', 'sticks');
  numberAt(sticks, 'lean', 'sticks', { positive: false });
  boolAt(sticks, 'throughCrest', 'sticks');
  if (Math.abs(sticks.lean) >= 89) fail('sticks.lean', 'must be under 89° from vertical');

  // --- crest ----------------------------------------------------------------
  const crest = req(spec, 'crest', '');
  numberAt(crest, 'length', 'crest');
  numberAt(crest, 'height', 'crest');
  numberAt(crest, 'thickness', 'crest');
  numberAt(crest, 'bottomAboveSeat', 'crest');
  stringAt(crest, 'tiltRef', 'crest', ['seat', 'sticks']);
  boolAt(crest, 'liveEdge', 'crest');
  if (crest.planCurve !== undefined && crest.planCurve !== null) {
    // v0.2: comb curved in plan, traced left tip -> right tip, >= 3 points.
    // `crest.length` stays the ALONG-CURVE length; the chord is derived.
    curveObject(crest, 'planCurve', 'crest', { min: 3 });
  } else {
    delete crest.planCurve;               // absent = straight comb
  }

  if (sticks.spread >= crest.length) {
    fail('sticks.spread', `must be < crest.length (${sticks.spread} >= ${crest.length})`);
  }
  if (sticks.spread >= seat.width) {
    fail('sticks.spread', `must be < seat.width (${sticks.spread} >= ${seat.width})`);
  }

  // --- arms -----------------------------------------------------------------
  if (spec.arms === undefined) spec.arms = null;
  if (spec.arms !== null) {
    const arms = spec.arms;
    stringAt(arms, 'style', 'arms', ARM_STYLES);
    numberAt(arms, 'aboveSeat', 'arms');       // every style has this
    if (arms.style === 'bow') {
      // v0.2 steam-bent armbow. SPEC.md: `bow` is required iff style "bow", and
      // the board fields below it belong to the other two styles.
      if (arms.bow === undefined || arms.bow === null) {
        fail('arms.bow', 'is required when arms.style is "bow"');
      }
      numberAt(arms.bow, 'section', 'arms.bow');
      const bowPairs = curveObject(arms.bow, 'planCurve', 'arms.bow', { min: 5 }).points;
      // the U must open forward: both tips ahead (min z) of the apex
      if (!bowOpensForward(bowPairs)) {
        fail('arms.bow.planCurve.points', 'the bow must open forward: both tips ahead (smaller z) of the apex');
      }
      const sp = req(arms.bow, 'spindles', 'arms.bow');
      numberAt(sp, 'count', 'arms.bow.spindles', { positive: false });
      if (!Number.isInteger(sp.count) || sp.count < 0) {
        fail('arms.bow.spindles.count', `must be an integer >= 0 (got ${sp.count})`);
      }
      numberAt(sp, 'diameter', 'arms.bow.spindles');
      if (arms.bow.section >= arms.aboveSeat) {
        warnings.push('arms.bow.section >= arms.aboveSeat — the bow would sit on the seat');
      }
      if (spec.legs.some((l) => l.throughArm)) {
        warnings.push('a leg is marked throughArm, but v0.2 bow arms do not carry the legs — drawn as if it were false');
      }
    } else {
      if (arms.bow !== undefined && arms.bow !== null) {
        fail('arms.bow', `is only allowed when arms.style is "bow" (style is "${arms.style}")`);
      }
      delete arms.bow;
      numberAt(arms, 'boardWidth', 'arms');
      numberAt(arms, 'thickness', 'arms');
      // SPEC.md types this number|null; null is documented ("full: derived").
      const len = numberAt(arms, 'length', 'arms', { allowNull: true });
      if (arms.style === 'end-boards' && len === null) {
        fail('arms.length', 'is required for style "end-boards" (board length, fore-aft)');
      }
      boolAt(arms, 'flushWithSeatFront', 'arms');
      if (arms.thickness >= arms.aboveSeat) {
        warnings.push('arms.thickness >= arms.aboveSeat — the arm board would sit on the seat');
      }
    }
  }

  return { spec, warnings };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

export { SpecError };
