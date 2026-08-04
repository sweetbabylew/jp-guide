// geometry.js — spec -> resolved parts in the chair frame (SPEC.md).
//
// Chair frame: origin at the centre of the seat's FRONT edge at FLOOR level,
// +X right (viewed from the front), +Y up, +Z toward the back. All lengths are
// in the spec's own units; nothing here knows about pixels.
//
// Everything a panel draws and everything a dimension prints comes out of this
// module, so a label can never disagree with the line it annotates.

import {
  toRad, legAngles, seatSlope, stickAngleOffSeatPerpendicular, sightlineDirection,
  seatFrameAngles,
} from './angles.js';
import {
  samplePlanCurve, fromPairs, extents, arcLength, chordLength, offsetBand,
  fitCircle, fitToleranceFor, scaleToArcLength, stationsByArcLength, pointAtArcLength,
} from './curve.js';

const T = (deg) => Math.tan(toRad(deg));
const C = (deg) => Math.cos(toRad(deg));
const S = (deg) => Math.sin(toRad(deg));

/** Seat plan outline as a closed ring of {x, z}, front edge first. */
function seatOutline(seat, units) {
  const hw = seat.width / 2;
  const d = seat.depth;
  const plan = seat.plan;
  if (plan.type === 'outline') {
    // v0.2 traced seat. Stored points are the TRACE; the ring drawn here is the
    // smoothed one, generated at draw time with curve.js's fixed parameters
    // (SPEC.md forbids resampling on load). Everything else about the seat —
    // width, depth, extents — is derived from this ring, so the label and the
    // line it annotates can never drift apart.
    return samplePlanCurve(fromPairs(plan.points), { units, closed: true })
      .map((p) => ({ x: p.x, z: p.y }));
  }
  if (plan.type === 'rect') {
    return [{ x: -hw, z: 0 }, { x: hw, z: 0 }, { x: hw, z: d }, { x: -hw, z: d }];
  }
  if (plan.type === 'trapezoid') {
    const bw = plan.backWidth / 2;
    return [{ x: -hw, z: 0 }, { x: hw, z: 0 }, { x: bw, z: d }, { x: -bw, z: d }];
  }
  // "d": straight front, circular arc back of radius plan.backRadius.
  const r = plan.backRadius;
  if (r < hw) {
    throw new Error(`spec at seat.plan.backRadius: must be >= half the seat width (${r} < ${hw})`);
  }
  const cz = d - r;                               // arc centre, on the centreline
  const zTangent = cz + Math.sqrt(r * r - hw * hw); // where the arc meets the sides
  const pts = [{ x: -hw, z: 0 }, { x: hw, z: 0 }, { x: hw, z: zTangent }];
  const a0 = Math.atan2(hw, zTangent - cz);
  const STEPS = 24;
  for (let i = 1; i <= STEPS; i += 1) {
    const a = a0 - (2 * a0 * i) / STEPS;
    pts.push({ x: r * Math.sin(a), z: cz + r * Math.cos(a) });
  }
  pts.push({ x: -hw, z: zTangent });
  return pts;
}

/**
 * Deterministic idealised live edge: a normalised drop profile in [0, 1].
 * No randomness — the same crest always draws the same edge. The profile is
 * shifted so its highest point is exactly 0, which keeps `crest.height` honest
 * as "the board height at its high point" (SPEC.md).
 */
function liveEdgeProfile(count) {
  const raw = [];
  for (let i = 0; i < count; i += 1) {
    const u = count === 1 ? 0 : i / (count - 1);
    const v =
      0.42 * Math.sin(7.3 * u + 0.9) +
      0.27 * Math.sin(13.1 * u + 2.4) +
      0.18 * Math.sin(21.7 * u + 5.1) +
      0.55 * (u - 0.5) * (u - 0.5);
    raw.push(v);
  }
  const hi = Math.max(...raw);
  const lo = Math.min(...raw);
  const span = hi - lo || 1;
  // 0 at the high point, up to 0.34 of the board height at the low point.
  return raw.map((v) => ((hi - v) / span) * 0.34);
}

/**
 * Every seat plan is "one single-valued front boundary and one single-valued
 * back boundary, both z(x)" — rect, trapezoid and D all satisfy it, and so does
 * any sanely traced v0.2 outline. Returning those two boundaries as functions
 * lets the axonometric mesh the seat as a swept solid whose faces line up
 * exactly with the outline used everywhere else.
 *
 * The v0.1 plans all have their front edge on z = 0, so `frontAt` is identically
 * zero for them and the axo geometry is unchanged; a traced outline with a
 * shaped front edge is now swept between the two real boundaries instead.
 */
function planBoundaries(outline) {
  const segs = [];
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (Math.abs(b.x - a.x) < 1e-9) continue;        // side edge, vertical in x
    segs.push([a, b]);
  }
  const scan = (x, wins) => {
    let best = null;
    for (const [a, b] of segs) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo - 1e-9 || x > hi + 1e-9) continue;
      const t = (x - a.x) / (b.x - a.x);
      const z = a.z + (b.z - a.z) * t;
      if (best === null || wins(z, best)) best = z;
    }
    return best === null ? 0 : best;
  };
  return {
    backAt: (x) => scan(x, (z, best) => z > best),
    frontAt: (x) => scan(x, (z, best) => z < best),
  };
}

export function resolve(spec) {
  const { seat, sticks, crest } = spec;
  const units = spec.meta.units;

  // --- seat ----------------------------------------------------------------
  const outline = seatOutline(seat, units);
  const traced = seat.plan.type === 'outline';
  const xMin = Math.min(...outline.map((q) => q.x));
  const xMax = Math.max(...outline.map((q) => q.x));
  const zMin = traced ? Math.min(...outline.map((q) => q.z)) : 0;
  const zMax = traced ? Math.max(...outline.map((q) => q.z)) : seat.depth;
  // For a traced outline the extents ARE the width and depth (SPEC.md v0.2);
  // for the templates they reproduce the stated numbers exactly.
  const width = traced ? xMax - xMin : seat.width;
  const depth = traced ? zMax - zMin : seat.depth;
  const slope = seatSlope(seat.heightFront, seat.heightBack, depth);
  /** Seat top height at fore-aft position z (linear front->back slope). */
  const topAt = (z) => seat.heightFront - ((seat.heightFront - seat.heightBack) * (z - zMin)) / depth;
  const bounds = planBoundaries(outline);
  const seatPart = {
    slope,
    outline,
    traced,
    width,
    depth,
    thickness: seat.thickness,
    heightFront: seat.heightFront,
    heightBack: seat.heightBack,
    // vertical extent of the slab: the stated thickness is perpendicular to
    // the sloped face (DIMENSIONS.md §1 row 4), so the drawn drop is larger.
    verticalThickness: seat.thickness / C(slope),
    topAt,
    bottomAt: (z) => topAt(z) - seat.thickness / C(slope),
    xMin,
    xMax,
    zMin,
    zMax,
    backAt: bounds.backAt,
    frontAt: bounds.frontAt,
  };

  // --- arms ----------------------------------------------------------------
  // The arm TOP is a horizontal plane at heightFront + aboveSeat. `aboveSeat`
  // is defined at the seat FRONT edge (SPEC.md; DIMENSIONS.md §4.4), and the
  // legacy arms slope only ~1°, so a level arm is the closest rule the schema
  // can express. See the build report for this resolved ambiguity.
  let arms = null;
  if (spec.arms && spec.arms.style === 'bow') {
    // --- v0.2 steam-bent armbow ---------------------------------------------
    // The traced curve IS the member: SPEC.md stores no span, no apex, no tips,
    // so everything below is derived from the sampled centreline. Unlike the
    // comb (whose stored `length` sizes it), nothing else in the spec fixes the
    // bow's size or its fore-aft position, so the trace is used as-is.
    const a = spec.arms;
    const section = a.bow.section;
    const flat = samplePlanCurve(fromPairs(a.bow.planCurve.points), { units });
    const pts = flat.map((p) => ({ x: p.x, z: p.y }));
    const band = offsetBand(flat, section);
    const box = extents(flat);
    const bandBox = extents(band.ring);
    const topY = seat.heightFront + a.aboveSeat;
    const botY = topY - section;               // round-ish stock: section deep
    const tipL = pts[0];
    const tipR = pts[pts.length - 1];
    const span = Math.hypot(tipR.x - tipL.x, tipR.z - tipL.z);
    const tipZ = (tipL.z + tipR.z) / 2;
    const apexZ = box.maxY;
    const along = arcLength(flat);
    const n = a.bow.spindles.count;
    // "spaced evenly BY ARC LENGTH between the tips" — interior stations, so no
    // spindle lands on a tip (that is where the hand goes).
    const stations = stationsByArcLength(flat, n).map((p) => ({ x: p.x, z: p.y, s: p.s }));
    arms = {
      style: 'bow',
      aboveSeat: a.aboveSeat,
      boardWidth: null,
      thickness: section,
      length: along,                // the bow's own along-curve length
      lengthDerived: true,
      flushWithSeatFront: false,
      topY,
      botY,
      boards: [],                   // a bow is one member, not two boards
      insideWidth: box.width - section,
      outsideWidth: bandBox.width,
      bow: {
        section,
        points: pts,
        band: {
          ring: band.ring.map((p) => ({ x: p.x, z: p.y })),
          left: band.left.map((p) => ({ x: p.x, z: p.y })),
          right: band.right.map((p) => ({ x: p.x, z: p.y })),
        },
        tipLeft: tipL,
        tipRight: tipR,
        span,
        tipZ,
        apexZ,
        apexDepth: apexZ - tipZ,
        xMin: box.minX,
        xMax: box.maxX,
        bandXMin: bandBox.minX,
        bandXMax: bandBox.maxX,
        alongLength: along,
        spindleCount: n,
        spindleDiameter: a.bow.spindles.diameter,
        spindlePitch: n > 0 ? along / (n + 1) : 0,
        spindles: stations,
      },
    };
  } else if (spec.arms) {
    const a = spec.arms;
    const topY = seat.heightFront + a.aboveSeat;
    const botY = topY - a.thickness;
    const zMin = a.flushWithSeatFront ? 0 : a.boardWidth;
    // style "full" leaves length null -> derived: the arm runs the seat depth
    // and overhangs the back by one board width.
    const length = a.length === null || a.length === undefined
      ? depth + a.boardWidth
      : a.length;
    // Both styles are two boards, each centred on its side's leg mortises —
    // that is what makes the legs able to pass through the arm, and it
    // reproduces the legacy "17 1/2 — inside arms" exactly.
    const frontLegs = spec.legs.filter((l) => l.id.startsWith('front-'));
    const centreFor = (side) => {
      const leg = frontLegs.find((l) => l.id.endsWith(side));
      return leg ? leg.mortise.x : (side === 'left' ? xMin : xMax);
    };
    const boards = ['left', 'right'].map((side) => {
      const cx = centreFor(side);
      return {
        side,
        centreX: cx,
        xMin: cx - a.boardWidth / 2,
        xMax: cx + a.boardWidth / 2,
        zMin,
        zMax: zMin + length,
        topY,
        botY,
      };
    });
    arms = {
      style: a.style,
      aboveSeat: a.aboveSeat,
      boardWidth: a.boardWidth,
      thickness: a.thickness,
      length,
      lengthDerived: a.length === null || a.length === undefined,
      flushWithSeatFront: a.flushWithSeatFront,
      topY,
      botY,
      boards,
      insideWidth: boards[1].xMin - boards[0].xMax,
      outsideWidth: boards[1].xMax - boards[0].xMin,
    };
  }

  // --- legs ----------------------------------------------------------------
  const legs = spec.legs.map((leg) => {
    const { x: mx, z: mz } = leg.mortise;
    const outboard = mx < 0 ? -1 : 1;
    const yM = topAt(mz);
    const dzPerDrop = T(leg.rake);              // + rake -> foot toward +Z
    const dxPerDrop = outboard * T(leg.splay);  // + splay -> foot outboard
    const foot = { x: mx + dxPerDrop * yM, y: 0, z: mz + dzPerDrop * yM };
    const mortise = { x: mx, y: yM, z: mz };
    // A v0.2 bow is a bent stick, not a board with mortises: it does not carry
    // the legs, so `throughArm` is ignored for that style (schema.js warns).
    const goesThroughArm = Boolean(arms && leg.throughArm && arms.style !== 'bow');
    const topY = goesThroughArm ? arms.topY : yM;
    const rise = topY - yM;
    const top = { x: mx - dxPerDrop * rise, y: topY, z: mz - dzPerDrop * rise };
    // Where the leg pierces the seat's UNDERSIDE — the shoulder point, and the
    // bottom end of the dashed "hidden inside the joint" line.
    //
    // The underside is a TILTED plane (heightFront != heightBack), so a raked
    // leg does not leave it after dropping one seat thickness: it keeps running
    // back into wood that is itself falling away. Solving against the plane
    // instead of against a horizontal line through bottomAt(mortiseZ) gives
    //
    //   drop = verticalThickness / (1 - tan(slope) * tan(rake))
    //
    // and reproduces the legacy shoulder points on all four legs of BOTH
    // measured drawings (armchair back leg z 13.66 / y 14.88 vs the drawing's
    // 13.655 / 14.895; the horizontal-plane answer was 13.64 / 14.94).
    const gz = T(slope) * dzPerDrop;                 // underside fall per unit drop
    const dropToBottom = Math.abs(1 - gz) < 1e-6
      ? seatPart.verticalThickness                   // leg parallel to the underside
      : seatPart.verticalThickness / (1 - gz);
    const atSeatBottom = {
      x: mx + dxPerDrop * dropToBottom,
      y: yM - dropToBottom,
      z: mz + dzPerDrop * dropToBottom,
    };
    let atArmBottom = null;
    if (goesThroughArm) {
      const r2 = arms.botY - yM;
      atArmBottom = { x: mx - dxPerDrop * r2, y: arms.botY, z: mz - dzPerDrop * r2 };
    }
    return {
      id: leg.id,
      group: leg.id.startsWith('front-') ? 'front' : 'back',
      side: leg.id.endsWith('left') ? 'left' : 'right',
      rake: leg.rake,
      splay: leg.splay,
      // `section` is the leg where it meets the seat; below the seat it tapers
      // linearly to `sectionFoot` at the floor. Above the seat a through-arm
      // leg continues as a round post of `postDiameter`. Both are defaulted in
      // schema.js, so they are always present here.
      section: leg.section,
      sectionFoot: leg.sectionFoot,
      postDiameter: leg.postDiameter,
      tapered: Math.abs(leg.sectionFoot - leg.section) > 1e-9,
      throughSeat: leg.throughSeat,
      throughArm: leg.throughArm,
      goesThroughArm,
      wedged: leg.wedged,
      mortise,
      foot,
      top,
      atSeatBottom,
      atArmBottom,
      angles: legAngles(leg.rake, leg.splay),
      // the same leg read against the seat — the frame it is actually drilled
      // in. Storage stays floor-frame (SPEC.md); this is derived, never stored.
      seatAngles: seatFrameAngles(leg.rake, leg.splay, slope),
      sightDir: sightlineDirection(leg.rake, leg.splay, mx),
    };
  });

  // --- sticks + crest -------------------------------------------------------
  const lean = sticks.lean;
  const baseY = topAt(sticks.rowZ);
  const pitch = sticks.count > 1 ? sticks.spread / (sticks.count - 1) : 0;
  const tilt = crest.tiltRef === 'sticks' ? lean : slope;

  // vertical rise -> along-stick length
  const alongToCrestBottom = crest.bottomAboveSeat / C(lean);
  // the stick crosses the crest board perpendicular-ish: the board's height
  // direction is `tilt` off vertical, so the included angle is (lean - tilt).
  const throughAngle = lean - tilt;
  const alongThroughCrest = crest.height / C(throughAngle);
  const alongTotal = sticks.throughCrest
    ? alongToCrestBottom + alongThroughCrest
    : alongToCrestBottom;

  const crestBottomY = baseY + crest.bottomAboveSeat;
  const crestBottomZ = sticks.rowZ + T(lean) * crest.bottomAboveSeat;

  // crest cross-section in (z, y): u = board height direction, t = thickness
  const u = { z: S(tilt), y: C(tilt) };
  const t = { z: C(tilt), y: -S(tilt) };
  const half = crest.thickness / 2;   // the stick row runs up the middle of the board
  const P = { z: crestBottomZ, y: crestBottomY };
  const sect = {
    bottomFront: { z: P.z - t.z * half, y: P.y - t.y * half },
    bottomBack: { z: P.z + t.z * half, y: P.y + t.y * half },
  };
  sect.topFront = { z: sect.bottomFront.z + u.z * crest.height, y: sect.bottomFront.y + u.y * crest.height };
  sect.topBack = { z: sect.bottomBack.z + u.z * crest.height, y: sect.bottomBack.y + u.y * crest.height };

  const stickItems = [];
  for (let i = 0; i < sticks.count; i += 1) {
    const x = sticks.count === 1 ? 0 : -sticks.spread / 2 + pitch * i;
    const base = { x, y: baseY, z: sticks.rowZ };
    const top = {
      x,
      y: baseY + alongTotal * C(lean),
      z: sticks.rowZ + alongTotal * S(lean),
    };
    const atCrestBottom = {
      x,
      y: crestBottomY,
      z: crestBottomZ,
    };
    stickItems.push({ index: i, x, base, top, atCrestBottom });
  }

  // Highest point of the piece: through-tenon tops if the sticks pass through
  // the crest, otherwise the crest's own top face at the stick line.
  const tenonRise = crest.height * C(lean) / C(throughAngle);
  const boardRise = crest.height * C(tilt);
  const overallHeight = crestBottomY + (sticks.throughCrest ? tenonRise : boardRise);

  // --- v0.2: comb curved in plan -------------------------------------------
  // The traced points give the SHAPE; the stored `crest.length` gives the SIZE
  // (SPEC.md: "`length` stays the ALONG-CURVE length; the chord is derived"), so
  // the sampled curve is scaled about its arc midpoint until the two agree.
  // Fore-aft it is then anchored on the crest's own derived z — the position of
  // the comb is already fixed by the stick lean and `bottomAboveSeat`, and the
  // plan must not contradict the elevations. Only the z is moved; the traced x
  // is honoured as-is, so an off-centre trace stays off-centre.
  let planCurve = null;
  if (crest.planCurve) {
    const shaped = scaleToArcLength(
      samplePlanCurve(fromPairs(crest.planCurve.points), { units }),
      crest.length,
    );
    const mid = pointAtArcLength(shaped, arcLength(shaped) / 2);
    const dz = crestBottomZ - mid.y;
    const flat = shaped.map((p) => ({ x: p.x, y: p.y + dz }));
    const pts = flat.map((p) => ({ x: p.x, z: p.y }));
    const band = offsetBand(flat, crest.thickness);
    const box = extents(flat);
    const fit = fitCircle(flat, fitToleranceFor(units));
    const chord = chordLength(flat);
    // z along the comb at any x — single-valued for a comb, which is what the
    // axonometric sweep and the elevations both assume.
    const zAtX = (x) => {
      for (let i = 0; i < flat.length - 1; i += 1) {
        const a = flat[i];
        const b = flat[i + 1];
        if ((x >= a.x && x <= b.x) || (x >= b.x && x <= a.x)) {
          const span = b.x - a.x;
          return Math.abs(span) < 1e-9 ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / span;
        }
      }
      return x < box.minX ? flat[0].y : flat[flat.length - 1].y;
    };
    planCurve = {
      points: pts,
      band: {
        ring: band.ring.map((p) => ({ x: p.x, z: p.y })),
        left: band.left.map((p) => ({ x: p.x, z: p.y })),
        right: band.right.map((p) => ({ x: p.x, z: p.y })),
      },
      chord,
      alongLength: crest.length,
      // A radius is printed only when a circle GENUINELY fits: a comb bent over
      // a form deserves the number, a comb shaped by eye gets "varies".
      radius: fit && fit.fits ? fit.r : null,
      fits: Boolean(fit && fit.fits),
      maxDeviation: fit ? fit.maxDeviation : null,
      centre: fit ? { x: fit.cx, z: fit.cy } : null,
      xMin: box.minX,
      xMax: box.maxX,
      zMin: box.minY,
      zMax: box.maxY,
      apexDepth: box.maxY - box.minY,
      tipLeft: pts[0],
      tipRight: pts[pts.length - 1],
      zAtX,
    };
  }
  // What the ELEVATIONS span: a straight comb spans its length, a curved one
  // spans its chord (RENDERER.md — elevations keep straight projection over the
  // chord, and the front view labels that chord).
  const elevationLength = planCurve ? planCurve.chord : crest.length;

  const crestPart = {
    length: crest.length,
    elevationLength,
    planCurve,
    height: crest.height,
    thickness: crest.thickness,
    bottomAboveSeat: crest.bottomAboveSeat,
    tiltRef: crest.tiltRef,
    tilt,
    liveEdge: crest.liveEdge,
    section: sect,
    bottomY: crestBottomY,
    bottomZ: crestBottomZ,
    topYAtBoard: crestBottomY + boardRise,
    // idealised live edge, front-elevation drop below the high point (0 = peak)
    edgeProfile: crest.liveEdge
      ? liveEdgeProfile(Math.max(9, sticks.count + 1)).map((d) => d * crest.height)
      : null,
  };

  // Vertical drop of the live edge below the high point, at any x along the
  // crest. Both the front elevation and the axonometric read the edge from
  // here, so the two views always agree.
  crestPart.edgeDropAt = (x) => {
    const prof = crestPart.edgeProfile;
    if (!prof) return 0;
    const n = prof.length;
    const t = ((x + elevationLength / 2) / elevationLength) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(t)));
    return prof[i] + (prof[i + 1] - prof[i]) * (t - i);
  };
  /** x of the i-th live-edge station — the axo meshes on these exact stations. */
  crestPart.edgeStations = crestPart.edgeProfile
    ? crestPart.edgeProfile.map((_, i) => -elevationLength / 2
        + (elevationLength * i) / (crestPart.edgeProfile.length - 1))
    : null;

  const sticksPart = {
    count: sticks.count,
    diameter: sticks.diameter,
    flatsPlanedFront: sticks.flatsPlanedFront,
    rowZ: sticks.rowZ,
    spread: sticks.spread,
    lean,
    throughCrest: sticks.throughCrest,
    pitch,
    baseY,
    items: stickItems,
    alongToCrestBottom,
    alongThroughCrest,
    alongTotal,
    // the angle the legacy drawings label: off the sloped seat's perpendicular
    angleOffSeatPerpendicular: stickAngleOffSeatPerpendicular(lean, slope),
    angles: legAngles(lean, 0),
    // the drilling frame, same shape as a leg's `seatAngles` so the angle table
    // can print one row per member without special-casing. A stick runs UP
    // through the seat, so the slope SUBTRACTS (angles.js) — and with no side
    // lean in the schema there is no splay term to rotate.
    seatAngles: legAngles(stickAngleOffSeatPerpendicular(lean, slope), 0),
  };

  const groups = ['front', 'back'].map((g) => {
    const leg = legs.find((l) => l.group === g);
    return { group: g, ...leg.angles, seat: leg.seatAngles };
  });

  return {
    spec,
    units,
    seat: seatPart,
    legs,
    sticks: sticksPart,
    crest: crestPart,
    arms,
    derived: {
      seatSlope: slope,
      seatTopAtSticks: baseY,
      stickPitch: pitch,
      overallHeight,
      alongStickToCrestBottom: alongToCrestBottom,
      alongStickTotal: alongTotal,
      legGroups: groups,
      insideArms: arms ? arms.insideWidth : null,
      outsideArms: arms ? arms.outsideWidth : null,
      // v0.2 — present only when the member exists, so a v0.1 chair's derived
      // block (and its angles.json) is byte-for-byte what it always was.
      ...(planCurve ? {
        crestChord: planCurve.chord,
        crestPlanRadius: planCurve.radius,
        crestPlanApexDepth: planCurve.apexDepth,
      } : {}),
      ...(arms && arms.bow ? {
        bowSpan: arms.bow.span,
        bowApexDepth: arms.bow.apexDepth,
        bowAlongLength: arms.bow.alongLength,
      } : {}),
    },
  };
}
