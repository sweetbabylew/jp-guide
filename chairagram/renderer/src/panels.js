// panels.js — one function per drawing panel. Each returns
//   { name, caption, body, width, height }
// with `body` already translated so the panel's top-left is (0, 0).
//
// Panels draw in panel pixel space (project.js). Nothing here reads the spec
// directly — everything comes from the resolved model (geometry.js), so a
// printed value can never drift from the line it belongs to.

import {
  PALETTE, STROKE, DASH, FONT, DIM_RAIL, dimLabel, formatAngle, formatLength,
} from './style.js';
import {
  line, polygon, polyline, ellipse, circle, text, rect,
} from './svg.js';
import {
  Canvas, Rail, verticalDim, horizontalDim, alignedDim, angleDim, leaderNote, note,
} from './dims.js';
import { makeProjector } from './project.js';
import { HATCH } from './style.js';
import { fitToleranceFor, maxChordDeviation } from './curve.js';

const PAD = 16;

const woodNear = {
  fill: PALETTE.woodFill,
  stroke: PALETTE.woodStroke,
  'stroke-width': STROKE.wood.toFixed(1),
  'stroke-linejoin': 'round',
};
const woodFar = {
  fill: PALETTE.woodFarFill,
  stroke: PALETTE.woodFarStroke,
  'stroke-width': STROKE.wood.toFixed(1),
  'stroke-linejoin': 'round',
};

function unit(a, b, fallback = { x: 0, y: -1 }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return fallback;
  return { x: dx / len, y: dy / len };
}

/**
 * Quad centred on the segment a->b, `wA` px wide at a and `wB` px wide at b;
 * both ends are cut square to the axis, as the legacy leg polygons are.
 * Point order is fixed and load-bearing: [0,1] is the edge at a, [2,3] the
 * edge at b — the tests measure those two edges to check the taper.
 */
function barQuad(a, b, wA, wB = wA) {
  const u = unit(a, b);
  const ax = -u.y * (wA / 2);
  const ay = u.x * (wA / 2);
  const bx = -u.y * (wB / 2);
  const by = u.x * (wB / 2);
  return [
    { x: a.x + ax, y: a.y + ay },
    { x: a.x - ax, y: a.y - ay },
    { x: b.x - bx, y: b.y - by },
    { x: b.x + bx, y: b.y + by },
  ];
}

function addPoly(canvas, pts, style) {
  canvas.add(polygon(pts, style), pts);
}

/**
 * Where the line p + t·r meets the line q + u·s, in panel space. `t` comes back
 * so callers can tell "just past the end" from "nowhere near". null if parallel.
 */
function lineCross(p, r, q, s) {
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
  return { x: p.x + r.x * t, y: p.y + r.y * t, t };
}

/**
 * The below-seat part of a leg, as an elevation actually shows it: the tapered
 * band CUT OFF BY THE SEAT'S UNDERSIDE, not cut square to the leg's own axis.
 *
 * What you see below a seat is the leg clipped by the surface it comes through.
 * Both long edges therefore stop ON the underside line, so the shoulder line
 * lies along the seat and the leg meets it with no notch and no float. Cutting
 * square to the axis instead (what the legacy drawings did, and what this
 * renderer used to do) leaves a wedge of white on one side of the leg and buries
 * the other corner in the seat — invisible on a 12° front leg, an eighth of an
 * inch wide on a 20° back leg, and in the FRONT view it left the whole back leg
 * hanging an inch clear of the seat, because there the drawn underside is the
 * seat's front face while the leg was stopping at its own (lower) exit point.
 *
 * The taper is anchored where the leg's AXIS crosses that line, which makes the
 * band exactly `section` wide measured square to the leg at the surface it comes
 * through, whatever angle the surface makes. Point order is barQuad's: [0,1] is
 * the edge at the seat, [2,3] the edge at the floor.
 */
function legBelowSeat(axisTop, foot, wTop, wFoot, clip) {
  const axis = { x: foot.x - axisTop.x, y: foot.y - axisTop.y };
  const u = unit(axisTop, foot);
  const n = { x: -u.y, y: u.x };
  const half = (w) => ({ x: (n.x * w) / 2, y: (n.y * w) / 2 });
  const at = (p, w, s) => ({ x: p.x + half(w).x * s, y: p.y + half(w).y * s });
  const seam = { x: clip.b.x - clip.a.x, y: clip.b.y - clip.a.y };
  const onAxis = lineCross(axisTop, axis, clip.a, seam);
  // t < 0.9 keeps a nonsense clip (a seat below the floor) from inverting the
  // leg; anything at or above the leg's own exit point is legitimate.
  const a = onAxis && onAxis.t < 0.9 ? { x: onAxis.x, y: onAxis.y } : axisTop;
  const corner = (s) => {
    const p0 = at(a, wTop, s);
    const p1 = at(foot, wFoot, s);
    const hit = lineCross(p0, { x: p1.x - p0.x, y: p1.y - p0.y }, clip.a, seam);
    return hit ? { x: hit.x, y: hit.y } : p0;
  };
  return [corner(1), corner(-1), at(foot, wFoot, -1), at(foot, wFoot, 1)];
}

/** Ground line + legacy down-left hatch ticks. */
function groundLine(canvas, x1, x2, y) {
  canvas.add(
    line(x1, y, x2, y, {
      stroke: PALETTE.ground,
      'stroke-width': STROKE.ground.toFixed(2),
      'stroke-linecap': 'butt',
      'data-role': 'ground',
    }),
    [{ x: x1, y }, { x: x2, y }],
  );
  for (let x = x1; x < x2; x += HATCH.pitch) {
    canvas.add(
      line(x, y, x - HATCH.run, y + HATCH.run, {
        stroke: PALETTE.groundHatch,
        'stroke-width': STROKE.groundHatch.toFixed(2),
        'stroke-linecap': 'butt',
      }),
    );
  }
  canvas.point(x1 - HATCH.run, y + HATCH.run);
  canvas.point(x2, y);
}

/**
 * Dashed "hidden inside the joint" line, legacy style. Given a width it draws
 * the two sides of the hidden tenon instead of its centreline — the tenon
 * passing through the seat or the arm is the POST, so it is sized from
 * `postDiameter`, not from the leg section below the seat.
 *
 * `faces` optionally names the two surfaces the tenon runs between (`{ at: line,
 * to: line }`, each `{ a, b }` in panel space). Each dashed side is then trimmed
 * on those lines rather than at the axis point, so the hidden tenon spans
 * exactly the wood it is buried in — the same rule the visible shoulder follows.
 */
function tenonDash(canvas, a, b, stroke = PALETTE.woodStroke, widthPx = 0, faces = null) {
  const st = {
    stroke,
    'stroke-width': STROKE.tenonDash.toFixed(2),
    'stroke-linecap': 'butt',
    'stroke-dasharray': DASH.tenon,
  };
  if (widthPx <= 0) {
    canvas.add(line(a.x, a.y, b.x, b.y, st), [a, b]);
    return;
  }
  const u = unit(a, b);
  const nx = -u.y * (widthPx / 2);
  const ny = u.x * (widthPx / 2);
  const trim = (p, dir, face) => {
    if (!face) return p;
    const hit = lineCross(p, dir, face.a, { x: face.b.x - face.a.x, y: face.b.y - face.a.y });
    return hit ? { x: hit.x, y: hit.y } : p;
  };
  for (const s of [1, -1]) {
    const q0 = { x: a.x + nx * s, y: a.y + ny * s };
    const q1 = { x: b.x + nx * s, y: b.y + ny * s };
    const dir = { x: q1.x - q0.x, y: q1.y - q0.y };
    const p0 = trim(q0, dir, faces && faces.at);
    const p1 = trim(q1, dir, faces && faces.to);
    canvas.add(line(p0.x, p0.y, p1.x, p1.y, st), [p0, p1]);
  }
}

/**
 * End-grain ellipse where a through-tenon emerges, centred ON the surface it
 * comes through — so its upper half stands proud of the outline, exactly as
 * the legacy chair_diagram.svg draws it. A wedged tenon also gets its kerf: a
 * thin contrasting mark across the end grain. These joints are the signature
 * of the style and have to read.
 */
function tenonEllipse(canvas, p, widthPx, far = false, wedged = false) {
  const rx = widthPx / 2;
  const ry = Math.max(1.4, rx * 0.4);
  canvas.add(
    ellipse(p.x, p.y, rx, ry, {
      fill: far ? PALETTE.tenonFarFill : PALETTE.tenonFill,
      stroke: PALETTE.tenonStroke,
      'data-role': 'tenon-end',
    }),
    [{ x: p.x - rx, y: p.y - ry }, { x: p.x + rx, y: p.y + ry }],
  );
  if (wedged) {
    canvas.add(line(p.x - rx * 0.82, p.y, p.x + rx * 0.82, p.y, {
      stroke: PALETTE.tenonStroke,
      'stroke-width': '1.10',
      'stroke-linecap': 'round',
      'data-role': 'wedge',
    }));
  }
}

/** Small square-corner mark, legacy perpendicular symbol (9 px legs). */
function perpMark(canvas, origin, u1, u2, size = 9) {
  const a = { x: origin.x + u1.x * size, y: origin.y + u1.y * size };
  const b = { x: a.x + u2.x * size, y: a.y + u2.y * size };
  const c = { x: origin.x + u2.x * size, y: origin.y + u2.y * size };
  const st = { stroke: PALETTE.dim, 'stroke-width': '1.00', 'stroke-linecap': 'round' };
  canvas.add(line(a.x, a.y, b.x, b.y, st), [a, b]);
  canvas.add(line(b.x, b.y, c.x, c.y, st), [c]);
}

function finish(name, caption, geo, chrome) {
  const c = new Canvas();
  if (chrome) {
    c.add(chrome.render());
    c.point(chrome.minX, chrome.minY);
    c.point(chrome.maxX, chrome.maxY);
  }
  c.add(geo.render());
  c.point(geo.minX, geo.minY);
  c.point(geo.maxX, geo.maxY);

  const capY = c.maxY + 34;
  const capX = (c.minX + c.maxX) / 2;
  c.add(text(capX, capY, caption, {
    size: FONT.caption,
    fill: PALETTE.caption,
    anchor: 'middle',
    weight: 'normal',
    letterSpacing: 2,
  }));
  c.box(capX - 90, capY - FONT.caption, 180, FONT.caption * 1.4);

  const dx = PAD - c.minX;
  const dy = PAD - c.minY;
  return {
    name,
    caption,
    width: c.width + PAD * 2,
    height: c.height + PAD * 2,
    // `content` is in panel-projection coords; `offset` moves it so the panel's
    // top-left sits at (0, 0). package.js folds the two translates into one
    // <g data-panel="…"> so a test can read absolute sheet coordinates.
    content: c.render(),
    offset: { x: dx, y: dy },
  };
}

// ===========================================================================
// SIDE ELEVATION — viewed from the chair's right; the FRONT edge is at the
// right of the panel (legacy convention).
// ===========================================================================

export function sidePanel(model) {
  const p = makeProjector('side', model.units);
  const k = p.scale;
  const units = model.units;
  const { seat, sticks, crest, arms, derived } = model;
  const geo = new Canvas();

  const P = (x, y, z) => p.at({ x, y, z });
  const groundY = 0;

  // --- seat slab ------------------------------------------------------------
  const seatPts = [
    P(0, seat.heightBack, seat.depth),
    P(0, seat.heightFront, 0),
    P(0, seat.bottomAt(0), 0),
    P(0, seat.bottomAt(seat.depth), seat.depth),
  ];
  addPoly(geo, seatPts, { ...woodNear, 'data-role': 'seat' });
  // The seat's two faces AS THIS PANEL DRAWS THEM — taken off the polygon above
  // so a leg can never stop anywhere but on the line it is supposed to meet.
  const seatTopFace = { a: seatPts[0], b: seatPts[1] };
  const seatUnderFace = { a: seatPts[3], b: seatPts[2] };

  // --- legs (near side only — the right-hand pair) --------------------------
  const nearLegs = model.legs.filter((l) => l.side === 'right');
  for (const leg of nearLegs) {
    // below the seat: tapered, `section` where it leaves the seat down to
    // `sectionFoot` at the floor (legacy leg polygons: 15 px top, 13.5 bottom),
    // and cut off ON the sloped underside rather than square to the leg
    const below = legBelowSeat(
      p.at(leg.atSeatBottom), p.at(leg.foot),
      leg.section * k, leg.sectionFoot * k, seatUnderFace,
    );
    addPoly(geo, below, { ...woodNear, 'data-role': `leg-${leg.id}` });
    if (leg.top.y > leg.mortise.y + 1e-9) {
      // above the seat: the round post, parallel-sided
      const above = barQuad(p.at(leg.mortise), p.at(leg.top), leg.postDiameter * k);
      addPoly(geo, above, { ...woodNear, 'data-role': `post-${leg.id}` });
    }
    if (leg.throughSeat) {
      tenonDash(geo, p.at(leg.mortise), p.at(leg.atSeatBottom),
        PALETTE.woodStroke, leg.postDiameter * k,
        { at: seatTopFace, to: seatUnderFace });
    }
  }

  // --- representative stick -------------------------------------------------
  const stick = sticks.items[sticks.items.length - 1];
  const sBase = p.at(stick.base);
  const sTop = p.at(stick.top);
  geo.add(
    line(sBase.x, sBase.y, sTop.x, sTop.y, {
      stroke: PALETTE.stickStroke,
      'stroke-width': (sticks.diameter * k).toFixed(2),
      'stroke-linecap': 'round',
      'data-role': 'stick',
    }),
    [sBase, sTop],
  );

  // --- arm ------------------------------------------------------------------
  if (arms && arms.bow) {
    // v0.2 armbow, side view: a band from the tips back to the apex, with a
    // rounded nose at the front — the hand end of a steam-bent bow is a turned
    // -ish round, never a square cut (RENDERER.md).
    // the short spindles on the near side first, seat top up to the bow
    // underside, so the band paints over their tops
    for (const s of arms.bow.spindles) {
      if (s.x < 0) continue;                       // far side, hidden behind
      const a = p.at({ x: 0, y: seat.topAt(s.z), z: s.z });
      const b = p.at({ x: 0, y: arms.botY, z: s.z });
      geo.add(line(a.x, a.y, b.x, b.y, {
        stroke: PALETTE.stickStroke,
        'stroke-width': (arms.bow.spindleDiameter * k).toFixed(2),
        'stroke-linecap': 'round',
        'data-role': 'bow-spindle',
      }), [a, b]);
    }
    const tip = P(0, arms.topY, arms.bow.tipZ);
    const apex = P(0, arms.topY, arms.bow.apexZ);
    const yTop = tip.y;
    const yBot = P(0, arms.botY, arms.bow.tipZ).y;
    const r = (yBot - yTop) / 2;
    const yMid = (yTop + yBot) / 2;
    const nose = [];
    const NOSE_STEPS = 12;
    for (let i = 0; i <= NOSE_STEPS; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / NOSE_STEPS;
      nose.push({ x: tip.x + r * Math.cos(a), y: yMid + r * Math.sin(a) });
    }
    addPoly(geo, [
      { x: apex.x, y: yTop }, ...nose, { x: apex.x, y: yBot },
    ], { ...woodNear, 'data-role': 'arm-bow' });
  } else if (arms) {
    const b = arms.boards[1];
    const armPts = [
      P(0, arms.topY, b.zMin), P(0, arms.topY, b.zMax),
      P(0, arms.botY, b.zMax), P(0, arms.botY, b.zMin),
    ];
    addPoly(geo, armPts, { ...woodNear, 'data-role': 'arm' });
    for (const leg of nearLegs) {
      if (!leg.goesThroughArm) continue;
      tenonDash(geo, p.at(leg.atArmBottom), p.at(leg.top),
        PALETTE.woodStroke, leg.postDiameter * k);
      tenonEllipse(geo, p.at(leg.top), leg.postDiameter * k, false, leg.wedged);
    }
  }

  // --- crest ----------------------------------------------------------------
  const cs = crest.section;
  const crestPts = [
    P(0, cs.topBack.y, cs.topBack.z), P(0, cs.topFront.y, cs.topFront.z),
    P(0, cs.bottomFront.y, cs.bottomFront.z), P(0, cs.bottomBack.y, cs.bottomBack.z),
  ];
  addPoly(geo, crestPts, { ...woodNear, 'data-role': 'crest' });
  if (sticks.throughCrest) tenonEllipse(geo, sTop, sticks.diameter * k, false, true);

  // --- angle dimensions (placed at their features) --------------------------
  // stick angle, measured off the sloped seat's perpendicular (legacy datum)
  const seatDirFront = unit(p.at({ x: 0, y: seat.topAt(sticks.rowZ), z: sticks.rowZ }),
    p.at({ x: 0, y: seat.heightFront, z: 0 }));
  const perpUp = { x: -seatDirFront.y, y: seatDirFront.x };
  const perpUpFixed = perpUp.y > 0 ? { x: -perpUp.x, y: -perpUp.y } : perpUp;
  const stickDir = unit(sBase, sTop);
  angleDim(geo, {
    vertex: sBase,
    from: perpUpFixed,
    to: stickDir,
    label: formatAngle(sticks.angleOffSeatPerpendicular),
    radius: 70,
    datumLength: 80,
    labelRadius: 84,
  });
  perpMark(geo, sBase, seatDirFront, perpUpFixed);

  // leg rake arcs, plumb datum, at each foot
  for (const leg of nearLegs) {
    if (leg.rake === 0 && leg.splay === 0) continue;
    const foot = p.at(leg.foot);
    const up = { x: 0, y: -1 };
    const legDir = unit(foot, p.at(leg.mortise));
    angleDim(geo, {
      vertex: foot,
      from: up,
      to: legDir,
      label: formatAngle(Math.abs(leg.rake)),
      radius: 58,
      datumLength: 70,
      labelRadius: 76,
      labelSide: 'outside',
    });
  }

  // along-the-stick span — the legacy "29 3/4 — seat to tenon top"
  const spanLabel = sticks.throughCrest ? 'seat to tenon top' : `seat to ${crest.liveEdge ? 'comb' : 'crest'} bottom`;
  alignedDim(geo, {
    a: sBase,
    b: sTop,
    offset: -38,
    label: dimLabel(sticks.alongTotal, spanLabel, units),
  });

  if (crest.liveEdge) {
    const peak = P(0, crest.topYAtBoard, cs.topFront.z);
    leaderNote(geo, {
      from: peak,
      to: { x: peak.x + 26, y: peak.y - 26 },
      label: `${formatLength(crest.height, units)} at its highest — varies (live edge)`,
      anchor: 'start',
    });
  }

  // --- chrome: ground + stacked linear dimensions ---------------------------
  const chrome = new Canvas();
  groundLine(chrome, geo.minX - 10, geo.maxX + 10, groundY);

  const leftRail = new Rail(geo.minX - DIM_RAIL.base, -1);
  const rightRail = new Rail(geo.maxX + DIM_RAIL.base, 1);
  const bottomRail = new Rail(Math.max(geo.maxY, groundY) + DIM_RAIL.base, 1);

  // left: seat height at the back, then overall height (largest goes outermost)
  const backTop = P(0, seat.heightBack, seat.depth);
  verticalDim(chrome, {
    x: leftRail.next(),
    y1: backTop.y,
    y2: groundY,
    from1: backTop,
    side: -1,
    label: dimLabel(seat.heightBack, 'seat back', units),
  });
  const crestTop = P(0, derived.overallHeight, sticks.throughCrest ? stick.top.z : cs.topFront.z);
  verticalDim(chrome, {
    x: leftRail.next(),
    y1: crestTop.y,
    y2: groundY,
    from1: crestTop,
    side: -1,
    label: dimLabel(derived.overallHeight, 'overall height', units),
  });

  // right: arm above seat (front datum), then seat height at the front
  if (arms) {
    const armTopFront = P(0, arms.topY, 0);
    const seatTopFront = P(0, seat.heightFront, 0);
    verticalDim(chrome, {
      x: rightRail.next(),
      y1: armTopFront.y,
      y2: seatTopFront.y,
      from1: armTopFront,
      from2: seatTopFront,
      side: 1,
      label: dimLabel(arms.aboveSeat, 'arm above seat', units),
    });
  }
  const frontTop = P(0, seat.heightFront, 0);
  verticalDim(chrome, {
    x: rightRail.next(),
    y1: frontTop.y,
    y2: groundY,
    from1: frontTop,
    side: 1,
    label: dimLabel(seat.heightFront, 'seat front', units),
  });

  // bottom: seat depth, measured as the plan run between the seat top corners
  horizontalDim(chrome, {
    y: bottomRail.next(),
    x1: backTop.x,
    x2: frontTop.x,
    from1: backTop,
    from2: frontTop,
    side: 1,
    label: dimLabel(seat.depth, 'seat depth', units),
  });

  return finish('side', 'SIDE ELEVATION', geo, chrome);
}

// ===========================================================================
// FRONT ELEVATION
// ===========================================================================

export function frontPanel(model) {
  const p = makeProjector('front', model.units);
  const k = p.scale;
  const units = model.units;
  const { seat, sticks, crest, arms } = model;
  const geo = new Canvas();
  const P = (x, y, z) => p.at({ x, y, z });
  const groundY = 0;

  // --- sticks (behind everything) -------------------------------------------
  // Their real base is at the stick row, well behind the seat's front face and
  // therefore hidden by it in this view; drawing from the seat's front top edge
  // is both the legacy convention and what an elevation actually shows.
  for (const s of sticks.items) {
    const a = p.at({ x: s.x, y: seat.heightFront, z: 0 });
    const b = p.at(s.top);
    geo.add(
      line(a.x, a.y, b.x, b.y, {
        stroke: PALETTE.stickStroke,
        'stroke-width': (sticks.diameter * k).toFixed(2),
        'stroke-linecap': 'round',
      }),
      [a, b],
    );
  }

  // The seat's underside AS THIS PANEL DRAWS IT: the front face's bottom edge,
  // level all the way across. Every leg is cut off on this one line — that is
  // what makes a front elevation read, and it is what the legacy drawings do
  // (all four leg tops on y = 398.8 in chair_diagram.svg, y = 400.0 in the
  // bench). A back leg leaves the real underside LOWER than this, because the
  // seat slopes away behind the front edge; stopping it there left it hanging an
  // inch clear of the seat with nothing under the seat but white paper.
  const hw = seat.width / 2;
  const seatUnderFace = { a: P(-hw, seat.bottomAt(0), 0), b: P(hw, seat.bottomAt(0), 0) };

  // --- legs: back pair first (lighter, nudged inboard so both read) ---------
  const sameX = model.legs.every((l) => Math.abs(Math.abs(l.mortise.x) - Math.abs(model.legs[0].mortise.x)) < 1e-6);
  const shift = sameX ? model.legs[0].section / 2 : 0;
  const drawLeg = (leg, style, dxUnits) => {
    const off = (q) => ({ x: q.x + dxUnits * k, y: q.y });
    const below = legBelowSeat(
      off(p.at(leg.atSeatBottom)), off(p.at(leg.foot)),
      leg.section * k, leg.sectionFoot * k, seatUnderFace,
    );
    addPoly(geo, below, { ...style, 'data-role': `leg-${leg.id}` });
    if (leg.top.y > leg.mortise.y + 1e-9) {
      addPoly(
        geo,
        barQuad(off(p.at(leg.mortise)), off(p.at(leg.top)), leg.postDiameter * k),
        { ...style, 'data-role': `post-${leg.id}` },
      );
    }
    return off;
  };
  const backOffsets = new Map();
  for (const leg of model.legs.filter((l) => l.group === 'back')) {
    const dxU = leg.side === 'left' ? shift : -shift;
    backOffsets.set(leg.id, drawLeg(leg, woodFar, dxU));
  }
  const frontOffsets = new Map();
  for (const leg of model.legs.filter((l) => l.group === 'front')) {
    frontOffsets.set(leg.id, drawLeg(leg, woodNear, 0));
  }

  // --- seat -----------------------------------------------------------------
  const seatPts = [
    P(-hw, seat.bottomAt(0), 0), P(hw, seat.bottomAt(0), 0),
    P(hw, seat.heightFront, 0), P(-hw, seat.heightFront, 0),
  ];
  addPoly(geo, seatPts, { ...woodNear, 'data-role': 'seat' });

  // --- arms + leg tenons ----------------------------------------------------
  if (arms && arms.bow) {
    // v0.2 armbow, front view: the bow is level, so it reads as a band spanning
    // the curve's x-extent. The short spindles stand under it; the long back
    // sticks were drawn first and simply pass through (RENDERER.md).
    for (const s of arms.bow.spindles) {
      const a = p.at({ x: s.x, y: seat.topAt(s.z), z: 0 });
      const b = p.at({ x: s.x, y: arms.botY, z: 0 });
      geo.add(line(a.x, a.y, b.x, b.y, {
        stroke: PALETTE.stickStroke,
        'stroke-width': (arms.bow.spindleDiameter * k).toFixed(2),
        'stroke-linecap': 'round',
        'data-role': 'bow-spindle',
      }), [a, b]);
    }
    const pts = [
      P(arms.bow.bandXMin, arms.botY, 0), P(arms.bow.bandXMax, arms.botY, 0),
      P(arms.bow.bandXMax, arms.topY, 0), P(arms.bow.bandXMin, arms.topY, 0),
    ];
    addPoly(geo, pts, { ...woodNear, 'data-role': 'arm-bow' });
  }
  if (arms) {
    for (const b of arms.boards) {
      const pts = [
        P(b.xMin, arms.botY, 0), P(b.xMax, arms.botY, 0),
        P(b.xMax, arms.topY, 0), P(b.xMin, arms.topY, 0),
      ];
      addPoly(geo, pts, { ...woodNear, 'data-role': `arm-${b.side}` });
    }
    for (const leg of model.legs) {
      if (!leg.goesThroughArm) continue;
      const far = leg.group === 'back';
      const off = far ? backOffsets.get(leg.id) : frontOffsets.get(leg.id);
      const q = off(p.at(leg.top));
      tenonDash(geo, off(p.at(leg.atArmBottom)), q,
        far ? PALETTE.woodFarStroke : PALETTE.woodStroke, leg.postDiameter * k);
      tenonEllipse(geo, q, leg.postDiameter * k, far, leg.wedged);
    }
  }

  // --- crest ----------------------------------------------------------------
  // A comb curved in plan still projects STRAIGHT here — over its chord, not
  // its along-curve length (RENDERER.md v0.2). `elevationLength` is the chord
  // when there is a plan curve and the plain length when there is not.
  const chw = crest.elevationLength / 2;
  const crestBotY = crest.bottomY;
  const crestTopY = crest.topYAtBoard;
  if (crest.liveEdge) {
    const prof = crest.edgeProfile;
    const n = prof.length;
    const top = [];
    for (let i = 0; i < n; i += 1) {
      const x = -chw + (crest.length * i) / (n - 1);
      top.push(P(x, crestTopY - prof[i], 0));
    }
    const pts = [P(-chw, crestBotY, 0), P(chw, crestBotY, 0), ...top.slice().reverse()];
    addPoly(geo, pts, { ...woodNear, 'data-role': 'crest' });
    geo.add(polyline(top, {
      fill: 'none',
      stroke: PALETTE.liveEdge,
      'stroke-width': '4',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'data-role': 'live-edge',
    }), top);
  } else {
    const pts = [
      P(-chw, crestBotY, 0), P(chw, crestBotY, 0),
      P(chw, crestTopY, 0), P(-chw, crestTopY, 0),
    ];
    addPoly(geo, pts, { ...woodNear, 'data-role': 'crest' });
  }
  if (sticks.throughCrest) {
    for (const s of sticks.items) {
      tenonEllipse(geo, P(s.x, s.top.y, 0), sticks.diameter * k, false, true);
    }
  }

  // --- inside-arms dimension, at the arm (legacy places it there) -----------
  if (arms && arms.style === 'full') {
    const yMid = (arms.topY + arms.botY) / 2;
    const a = P(arms.boards[0].xMax, yMid, 0);
    const b = P(arms.boards[1].xMin, yMid, 0);
    const label = dimLabel(arms.insideWidth, 'inside arms', units);
    const w = label.length * FONT.dim * 0.55;
    geo.add(rect((a.x + b.x) / 2 - w / 2 - 4, a.y - 11, w + 8, 15, {
      fill: 'white', 'fill-opacity': '0.9',
    }));
    horizontalDim(geo, { y: a.y, x1: a.x, x2: b.x, side: -1, label });
  }

  // --- notes ----------------------------------------------------------------
  const crestWord = crest.liveEdge ? 'comb' : 'crest';
  const noteBits = [
    `${sticks.count} sticks`,
    sticks.flatsPlanedFront ? 'flats planed on front' : null,
    'plumb in this view',
    model.legs.every((l) => l.splay === 0) ? 'legs plumb, no splay' : null,
    crest.planCurve
      ? `${crestWord} ${formatLength(crest.length, units)} along the curve`
      : null,
    arms && arms.bow
      ? `${arms.bow.spindleCount} bow spindles at ${formatLength(arms.bow.spindlePitch, units)} centres along the bow`
      : null,
  ].filter(Boolean);

  // --- chrome ---------------------------------------------------------------
  const chrome = new Canvas();
  groundLine(chrome, geo.minX - 10, geo.maxX + 10, groundY);

  const topRail = new Rail(geo.minY - DIM_RAIL.base, -1);
  const bottomRail = new Rail(Math.max(geo.maxY, groundY) + DIM_RAIL.base, 1);

  const cl = P(-chw, crestTopY, 0);
  const cr = P(chw, crestTopY, 0);
  horizontalDim(chrome, {
    y: topRail.next(),
    x1: cl.x,
    x2: cr.x,
    from1: cl,
    from2: cr,
    side: -1,
    // A curved comb is labelled with the CHORD here — that is the distance this
    // view actually shows; its along-curve `length` is in the panel note and
    // its plan radius is on the seat plan.
    label: crest.planCurve
      ? dimLabel(crest.elevationLength, `${crestWord} chord`, units)
      : dimLabel(crest.length, `${crestWord} length`, units),
  });

  const sl = P(-hw, seat.bottomAt(0), 0);
  const sr = P(hw, seat.bottomAt(0), 0);
  const wRail = bottomRail.next();
  horizontalDim(chrome, {
    y: wRail,
    x1: sl.x,
    x2: sr.x,
    from1: sl,
    from2: sr,
    side: 1,
    label: dimLabel(seat.width, 'seat width', units),
  });
  note(chrome, {
    x: (sl.x + sr.x) / 2,
    y: wRail + 30,
    label: noteBits.join(' · '),
    anchor: 'middle',
  });
  if (sameX) {
    note(chrome, {
      x: geo.maxX + 6,
      y: (P(0, seat.heightFront, 0).y + P(0, crest.bottomY, 0).y) / 2,
      label: 'back legs offset to show',
      anchor: 'start',
      size: FONT.smallNote,
      italic: true,
      fill: PALETTE.aside,
    });
  }

  return finish('front', 'FRONT ELEVATION', geo, chrome);
}

// ===========================================================================
// SEAT PLAN — viewed from above, seat FRONT edge at the bottom of the panel.
// ===========================================================================

/**
 * What the plan says about a comb's curve. THE one place the radius / "varies" /
 * "straight" choice is made.
 *
 * A fitted radius when a circle genuinely fits (geometry.js already applied
 * curve.js's tolerance). Otherwise there are two ways to have no radius, and
 * they are opposite facts about the chair:
 *
 *   straight   the trace is dead straight (or within the same 1/16 in band of
 *              its own chord), so no circle fits because there is no arc. A
 *              three-click comb clicked along a straight edge is MAXIMALLY
 *              regular, and telling that chairmaker "varies (no single arc
 *              fits)" is both false and alarming.
 *   varies     the trace really is irregular — shaped by eye, no one radius to
 *              scribe. This is the honest answer there, and it stays.
 */
function planCurveLabel(pc, crestWord, units) {
  if (pc.radius !== null) return dimLabel(pc.radius, `${crestWord} radius in plan`, units);
  // plan curves carry {x, z}; curve.js is frame-agnostic and wants {x, y}
  const flat = pc.points.map((q) => ({ x: q.x, y: q.z }));
  if (maxChordDeviation(flat) <= fitToleranceFor(units)) {
    return `${crestWord} straight in plan`;
  }
  return `${crestWord} curve in plan — radius varies (no single arc fits)`;
}

export function planPanel(model) {
  const p = makeProjector('plan', model.units);
  const k = p.scale;
  const units = model.units;
  const { seat, sticks, crest, arms } = model;
  const geo = new Canvas();
  const P = (x, z) => p.at({ x, y: 0, z });

  // seat outline (a traced v0.2 outline is already the smoothed ring)
  const outline = seat.outline.map((q) => P(q.x, q.z));
  addPoly(geo, outline, { ...woodNear, 'data-role': 'seat-plan' });

  // --- v0.2 curved members, drawn as plan bands ------------------------------
  const crestWord = crest.liveEdge ? 'comb' : 'crest';
  if (crest.planCurve) {
    // the comb's footprint: its centreline ± half its thickness
    addPoly(geo, crest.planCurve.band.ring.map((q) => P(q.x, q.z)), {
      ...woodFar, 'data-role': 'crest-plan',
    });
  }
  if (arms && arms.bow) {
    // Outline only, no fill: the bow is a foot or so ABOVE this plane, and this
    // panel is also the seat pattern — nothing may hide the seat, its mortises
    // or its sightlines.
    addPoly(geo, arms.bow.band.ring.map((q) => P(q.x, q.z)), {
      fill: 'none',
      stroke: PALETTE.woodStroke,
      'stroke-width': STROKE.wood.toFixed(1),
      'stroke-linejoin': 'round',
      'data-role': 'arm-bow-plan',
    });
    for (const [i, s] of arms.bow.spindles.entries()) {
      const c = P(s.x, s.z);
      const r = (arms.bow.spindleDiameter * k) / 2;
      geo.add(circle(c.x, c.y, r, {
        fill: PALETTE.tenonFill,
        stroke: PALETTE.tenonStroke,
        'stroke-width': '1.0',
        'data-role': `bow-spindle-${i}`,
      }), [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }]);
    }
  }

  // centreline
  const zMax = Math.max(...seat.outline.map((q) => q.z));
  const clA = P(0, -2.2);
  const clB = P(0, zMax + 2.2);
  geo.add(line(clA.x, clA.y, clB.x, clB.y, {
    stroke: PALETTE.dim,
    'stroke-width': '0.80',
    'stroke-linecap': 'butt',
    'stroke-dasharray': '9,3,2,3',
    'data-role': 'centreline',
  }), [clA, clB]);

  // sightlines radiating from every leg mortise
  for (const leg of model.legs) {
    const m = P(leg.mortise.x, leg.mortise.z);
    const d = leg.sightDir;
    const dir = d.defined
      ? unit(m, P(leg.mortise.x + d.x, leg.mortise.z + d.z))
      : { x: 0, y: -1 };
    const reach = 5.5 * k;
    const a = { x: m.x - dir.x * reach, y: m.y - dir.y * reach };
    const b = { x: m.x + dir.x * reach, y: m.y + dir.y * reach };
    geo.add(line(a.x, a.y, b.x, b.y, {
      stroke: PALETTE.dim,
      'stroke-width': '1.20',
      'stroke-linecap': 'butt',
      'stroke-dasharray': DASH.sight,
      'data-role': `sightline-${leg.id}`,
    }), [a, b]);
    const lab = `${formatAngle(leg.angles.sightline)} sightline`;
    note(geo, {
      x: b.x + (dir.x >= 0 ? 4 : -4),
      y: b.y + (dir.y >= 0 ? 10 : -4),
      label: lab,
      anchor: dir.x >= 0 ? 'start' : 'end',
      size: FONT.smallNote,
    });
  }

  // leg mortises — sized from `section`, the leg AT SEAT LEVEL, which is what
  // the plan view cuts through (the reduced post is above this plane)
  for (const leg of model.legs) {
    const h = (leg.section * k) / 2;
    const m = P(leg.mortise.x, leg.mortise.z);
    const pts = [
      { x: m.x - h, y: m.y - h }, { x: m.x + h, y: m.y - h },
      { x: m.x + h, y: m.y + h }, { x: m.x - h, y: m.y + h },
    ];
    addPoly(geo, pts, {
      fill: PALETTE.tenonFill,
      stroke: PALETTE.tenonStroke,
      'stroke-width': STROKE.wood.toFixed(1),
      'data-role': `mortise-${leg.id}`,
    });
  }

  // stick row
  for (const s of sticks.items) {
    const c = P(s.x, sticks.rowZ);
    const r = (sticks.diameter * k) / 2;
    geo.add(circle(c.x, c.y, r, {
      fill: PALETTE.tenonFill,
      stroke: PALETTE.tenonStroke,
      'stroke-width': '1.0',
    }), [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }]);
  }

  // --- chrome ---------------------------------------------------------------
  const chrome = new Canvas();
  const leftRail = new Rail(geo.minX - DIM_RAIL.base, -1);
  const rightRail = new Rail(geo.maxX + DIM_RAIL.base, 1);
  const topRail = new Rail(geo.minY - DIM_RAIL.base, -1);
  const bottomRail = new Rail(geo.maxY + DIM_RAIL.base, 1);

  const front = P(0, 0);
  const frontLeg = model.legs.find((l) => l.group === 'front');
  const backLeg = model.legs.find((l) => l.group === 'back');

  // left rail: mortise Z positions, then the stick row (datum: the front edge,
  // stated once in the panel note rather than repeated in every label)
  for (const [leg, name] of [[frontLeg, 'front mortise'], [backLeg, 'back mortise']]) {
    const m = P(leg.mortise.x, leg.mortise.z);
    verticalDim(chrome, {
      x: leftRail.next(),
      y1: front.y,
      y2: m.y,
      from1: { x: -seat.width / 2 * k, y: front.y },
      from2: { x: m.x, y: m.y },
      side: -1,
      label: dimLabel(leg.mortise.z, name, units),
    });
  }
  const row = P(0, sticks.rowZ);
  verticalDim(chrome, {
    x: leftRail.next(),
    y1: front.y,
    y2: row.y,
    from1: { x: -seat.width / 2 * k, y: front.y },
    from2: { x: row.x, y: row.y },
    side: -1,
    label: dimLabel(sticks.rowZ, 'stick row', units),
  });

  // right rail: seat depth
  const back = P(0, seat.depth);
  verticalDim(chrome, {
    x: rightRail.next(),
    y1: front.y,
    y2: back.y,
    from1: { x: seat.width / 2 * k, y: front.y },
    from2: { x: seat.width / 2 * k, y: back.y },
    side: 1,
    label: dimLabel(seat.depth, 'seat depth', units),
  });

  // top rail: mortise off the centreline, then the stick spread
  const rightLeg = model.legs.find((l) => l.side === 'right' && l.group === 'back');
  const rm = P(rightLeg.mortise.x, rightLeg.mortise.z);
  horizontalDim(chrome, {
    y: topRail.next(),
    x1: P(0, rightLeg.mortise.z).x,
    x2: rm.x,
    from1: { x: 0, y: rm.y },
    from2: rm,
    side: -1,
    label: dimLabel(Math.abs(rightLeg.mortise.x), 'mortise off centreline', units),
  });
  const s0 = P(sticks.items[0].x, sticks.rowZ);
  const s1 = P(sticks.items[sticks.items.length - 1].x, sticks.rowZ);
  horizontalDim(chrome, {
    y: topRail.next(),
    x1: s0.x,
    x2: s1.x,
    from1: s0,
    from2: s1,
    side: -1,
    label: dimLabel(sticks.spread, 'stick spread', units),
  });

  // --- v0.2 curved-member dimensions ---------------------------------------
  if (arms && arms.bow) {
    const bow = arms.bow;
    const tl = P(bow.tipLeft.x, bow.tipLeft.z);
    const tr = P(bow.tipRight.x, bow.tipRight.z);
    horizontalDim(chrome, {
      y: topRail.next(),
      x1: tl.x,
      x2: tr.x,
      from1: tl,
      from2: tr,
      side: -1,
      label: dimLabel(bow.span, 'bow tip to tip', units),
    });
    const apexPt = P(0, bow.apexZ);
    const tipPt = P(0, bow.tipZ);
    verticalDim(chrome, {
      x: rightRail.next(),
      y1: tipPt.y,
      y2: apexPt.y,
      from1: { x: tr.x, y: tipPt.y },
      from2: { x: tr.x, y: apexPt.y },
      side: 1,
      label: dimLabel(bow.apexDepth, 'bow apex depth', units),
    });
  }
  if (crest.planCurve) {
    // The radius is printed ONLY when a circle genuinely fits the curve within
    // tolerance (curve.js). Anything else says so, because a wrong radius sends
    // someone to the bench with the wrong template.
    const pc = crest.planCurve;
    const ys = pc.band.ring.map((q) => P(q.x, q.z).y);
    note(chrome, {
      x: P(pc.xMin, pc.zMin).x,
      y: Math.min(...ys) - 7,
      label: planCurveLabel(pc, crestWord, units),
      anchor: 'start',
      size: FONT.smallNote,
    });
  }

  // bottom rail: seat width
  const bl = P(-seat.width / 2, 0);
  const br = P(seat.width / 2, 0);
  const y = bottomRail.next();
  horizontalDim(chrome, {
    y,
    x1: bl.x,
    x2: br.x,
    from1: bl,
    from2: br,
    side: 1,
    label: dimLabel(seat.width, 'seat width', units),
  });
  note(chrome, {
    x: (bl.x + br.x) / 2,
    y: y + 30,
    label: `${sticks.count} sticks at ${formatLength(model.derived.stickPitch, units)} centres · fore-aft positions measured from the seat front edge`,
    anchor: 'middle',
  });
  note(chrome, {
    x: (bl.x + br.x) / 2,
    y: y + 45,
    label: 'sightlines shown from every leg mortise · bevel-gauge settings in the angle table',
    anchor: 'middle',
    size: FONT.smallNote,
    fill: PALETTE.aside,
  });

  return finish('plan', 'SEAT PLAN', geo, chrome);
}

// ===========================================================================
// AXONOMETRIC INSET — parallel projection along the seat diagonal.
// Light linework, no dimensions (RENDERER.md).
// ===========================================================================

//
// Hidden-surface removal is a painter's algorithm over FACES, not over parts:
// every solid is decomposed into its faces and every rod (leg segment, stick)
// into a screen-space bar, each carrying a depth along the view direction.
// Everything is then sorted far -> near and painted in that order, so near
// opaque parts occlude far ones. Rods are split at the seat and arm planes so
// a leg that crosses another leg between seat and arm sorts per segment: the
// front and back posts of a JP chair cross on screen but never overlap in
// depth once split, so the crossing comes out right.

//
// HIDDEN-SURFACE REMOVAL. Painter's algorithm, but the unit that gets painted
// is a DEPTH-COMPACT PATCH, not a whole part. One depth value can only stand
// for a piece of geometry whose own depth barely varies; a 55 in bench seat
// spans ~32 units of depth, so a single centroid sorts correctly at one end of
// the slab and wrongly at the other (the far end-cap swallowed the far legs).
// So every surface here is a parametric patch that is meshed until each cell's
// depth spread is under DEPTH_CELL, and every rod is split along its length
// the same way. Cells are then sorted far -> near and painted.
//
// Cells carry fill only; the visible outline of a face is stroked by the cells
// that own a real boundary edge, so meshing never shows up as a grid. Cells
// are grown a fraction of a pixel about their centre to kill antialias seams.

const DEPTH_CELL = 2.0;   // spec units of depth spread per painted cell
const CELL_GROW = 0.4;    // px, seam cover
const MAX_STEPS = 30;

export function axoPanel(model) {
  const p = makeProjector('axo', model.units);
  const k = p.scale;
  const { seat, sticks, crest, arms } = model;
  const geo = new Canvas();

  const items = [];
  const push = (depth, svg, pts) => items.push({ depth, svg, pts, seq: items.length });

  // unit vector toward the viewer, recovered from the projector's own depth
  // function so there is exactly one definition of the view direction
  const origin = { x: 0, y: 0, z: 0 };
  const d0 = p.depth(origin);
  const VIEW = {
    x: p.depth({ x: 1, y: 0, z: 0 }) - d0,
    y: p.depth({ x: 0, y: 1, z: 0 }) - d0,
    z: p.depth({ x: 0, y: 0, z: 1 }) - d0,
  };

  const fillOnly = { fill: PALETTE.axoFill, stroke: 'none' };
  const edgeStroke = {
    fill: 'none',
    stroke: PALETTE.axoStroke,
    'stroke-width': STROKE.axo.toFixed(1),
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  };
  const liveEdgeStroke = { ...edgeStroke, stroke: PALETTE.liveEdge, 'stroke-width': '1.8' };

  const spread = (a, b) => Math.abs(p.depth(a) - p.depth(b));
  const steps = (d) => Math.max(1, Math.min(MAX_STEPS, Math.ceil(d / DEPTH_CELL)));

  /**
   * Is this cell's outward face turned toward the viewer? `centre` is the
   * centroid of the solid, which disambiguates the sign of the cell normal
   * without any winding-order bookkeeping (every solid here is convex).
   * The view direction toward the viewer is the gradient of p.depth, read off
   * three probe points so the projector stays the single source of truth.
   */
  const facesViewer = (c3, centre) => {
    const e1 = { x: c3[1].x - c3[0].x, y: c3[1].y - c3[0].y, z: c3[1].z - c3[0].z };
    const e2 = { x: c3[3].x - c3[0].x, y: c3[3].y - c3[0].y, z: c3[3].z - c3[0].z };
    let n = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const mid = {
      x: (c3[0].x + c3[1].x + c3[2].x + c3[3].x) / 4 - centre.x,
      y: (c3[0].y + c3[1].y + c3[2].y + c3[3].y) / 4 - centre.y,
      z: (c3[0].z + c3[1].z + c3[2].z + c3[3].z) / 4 - centre.z,
    };
    if (n.x * mid.x + n.y * mid.y + n.z * mid.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
    return n.x * VIEW.x + n.y * VIEW.y + n.z * VIEW.z > 0;
  };

  /** Grow a screen polygon about its centroid, to hide antialias seams. */
  const grown = (pts) => {
    let cx = 0;
    let cy = 0;
    for (const q of pts) { cx += q.x; cy += q.y; }
    cx /= pts.length; cy /= pts.length;
    return pts.map((q) => {
      const dx = q.x - cx;
      const dy = q.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: q.x + (dx / len) * CELL_GROW, y: q.y + (dy / len) * CELL_GROW };
    });
  };

  /**
   * Mesh a parametric surface F(u, v), u,v in [0,1].
   * `edges` names which of the four parameter borders are real outlines.
   * `extras` is markup pinned to a (u, v) location — a tenon end, painted with
   * the one cell that contains it so it can never sort away from its own face.
   * `uStations` forces the u samples (the live edge meshes on its own stations).
   * `centre` is the centroid of the solid this surface belongs to; it turns the
   * cell normal into an OUTWARD normal, which lets back faces be culled. That
   * matters as much as the sort: an unculled back face is a real surface at a
   * real depth, and a stub tenon buried in the comb would otherwise paint over
   * the comb's own underside.
   */
  const surface = (F, {
    edges = {}, extras = [], uStations = null, topStyle = edgeStroke, role = null,
    centre = null,
  } = {}) => {
    const nu = uStations
      ? uStations.length - 1
      : steps(Math.max(spread(F(0, 0), F(1, 0)), spread(F(0, 1), F(1, 1))));
    const nv = steps(Math.max(spread(F(0, 0), F(0, 1)), spread(F(1, 0), F(1, 1))));
    const uAt = (i) => (uStations ? uStations[i] : i / nu);
    const grid = [];
    for (let i = 0; i <= nu; i += 1) {
      const row = [];
      for (let j = 0; j <= nv; j += 1) row.push(F(uAt(i), j / nv));
      grid.push(row);
    }
    for (let i = 0; i < nu; i += 1) {
      for (let j = 0; j < nv; j += 1) {
        const c3 = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        if (centre && !facesViewer(c3, centre)) continue;
        const scr = c3.map((q) => p.at(q));
        let svg = polygon(grown(scr), role ? { ...fillOnly, 'data-role': role } : fillOnly);
        // outline strokes owned by this cell
        const strokes = [];
        if (j === 0 && edges.v0) strokes.push([scr[0], scr[1]]);
        if (j === nv - 1 && edges.v1) strokes.push([scr[3], scr[2]]);
        if (i === 0 && edges.u0) strokes.push([scr[0], scr[3]]);
        if (i === nu - 1 && edges.u1) strokes.push([scr[1], scr[2]]);
        for (const [a, b] of strokes) {
          const st = (j === 0 && edges.v0 && a === scr[0] && b === scr[1]) ? topStyle : edgeStroke;
          svg += `\n${polyline([a, b], st)}`;
        }
        for (const e of extras) {
          const ii = Math.min(nu - 1, Math.floor(e.u * nu));
          const jj = Math.min(nv - 1, Math.floor(e.v * nv));
          if (ii === i && jj === j) svg += `\n${e.svg}`;
        }
        let d = 0;
        for (const q of c3) d += p.depth(q);
        push(d / 4, svg, scr);
      }
    }
  };

  /** A member drawn as a bar, tapering wA -> wB, split into compact segments. */
  const rod = (a, b, wA, wB, opts = {}) => {
    const n = steps(spread(a, b));
    const style = {
      fill: PALETTE.axoRod,
      stroke: 'none',
      ...(opts.role ? { 'data-role': opts.role } : {}),
    };
    for (let i = 0; i < n; i += 1) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const q0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0, z: a.z + (b.z - a.z) * t0 };
      const q1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1, z: a.z + (b.z - a.z) * t1 };
      const s0 = p.at(q0);
      const s1 = p.at(q1);
      const quad = barQuad(s0, s1, (wA + (wB - wA) * t0) * k, (wA + (wB - wA) * t1) * k);
      push((p.depth(q0) + p.depth(q1)) / 2, polygon(grown(quad), style), quad);
    }
  };

  /** End grain of a through-tenon, drawn IN the plane it comes through. */
  const tenonFace = (centre, e1, e2, wedged) => {
    const ring = [];
    const STEPS = 20;
    for (let i = 0; i < STEPS; i += 1) {
      const t = (2 * Math.PI * i) / STEPS;
      ring.push(p.at({
        x: centre.x + e1.x * Math.cos(t) + e2.x * Math.sin(t),
        y: centre.y + e1.y * Math.cos(t) + e2.y * Math.sin(t),
        z: centre.z + e1.z * Math.cos(t) + e2.z * Math.sin(t),
      }));
    }
    let svg = polygon(ring, {
      fill: PALETTE.tenonFill,
      stroke: PALETTE.tenonStroke,
      'stroke-width': '1.0',
      'data-role': 'tenon-end',
    });
    if (wedged) {
      const w = 0.14;
      const kerf = [
        { c: -0.86, s: w }, { c: 0.86, s: w * 0.45 },
        { c: 0.86, s: -w * 0.45 }, { c: -0.86, s: -w },
      ].map((q) => p.at({
        x: centre.x + e1.x * q.c + e2.x * q.s,
        y: centre.y + e1.y * q.c + e2.y * q.s,
        z: centre.z + e1.z * q.c + e2.z * q.s,
      }));
      svg += `\n${polygon(kerf, { fill: PALETTE.tenonStroke, stroke: 'none', 'data-role': 'wedge' })}`;
    }
    return svg;
  };

  // --- legs -----------------------------------------------------------------
  const armExtras = new Map(['left', 'right'].map((s) => [s, []]));
  const seatExtras = [];
  for (const leg of model.legs) {
    // below the seat: tapered section -> sectionFoot
    rod(leg.atSeatBottom, leg.foot, leg.section, leg.sectionFoot, { role: `leg-${leg.id}` });
    // above the seat: the round post
    const upperTo = leg.goesThroughArm ? leg.atArmBottom : leg.top;
    if (upperTo.y > leg.mortise.y + 1e-9) {
      rod(leg.mortise, upperTo, leg.postDiameter, leg.postDiameter, { role: `post-${leg.id}` });
    }
    // end grain: the post cut by a horizontal plane at `resultant` off vertical
    const r = leg.postDiameter / 2;
    const d = leg.sightDir.defined ? leg.sightDir : { x: 0, z: 1 };
    const e1 = { x: -d.z * r, y: 0, z: d.x * r };
    const stretch = r / Math.cos((leg.angles.resultant * Math.PI) / 180);
    const e2 = { x: d.x * stretch, y: 0, z: d.z * stretch };
    if (leg.goesThroughArm) {
      const b = arms.boards.find((q) => q.side === leg.side);
      armExtras.get(leg.side).push({
        u: (leg.top.x - b.xMin) / (b.xMax - b.xMin),
        v: (leg.top.z - b.zMin) / (b.zMax - b.zMin),
        svg: tenonFace(leg.top, e1, e2, leg.wedged),
      });
    } else if (leg.throughSeat) {
      const zb = seat.backAt(leg.mortise.x) || 1;
      seatExtras.push({
        u: (leg.mortise.x - seat.xMin) / (seat.xMax - seat.xMin),
        v: leg.mortise.z / zb,
        svg: tenonFace(leg.mortise, e1, e2, leg.wedged),
      });
    }
  }

  // --- seat slab, meshed as a solid swept along X ---------------------------
  const sx = (u) => seat.xMin + (seat.xMax - seat.xMin) * u;
  const lerp = (a, b, t) => a + (b - a) * t;
  const seatMid = seat.backAt(0) / 2;
  const seatCentre = {
    x: (seat.xMin + seat.xMax) / 2,
    y: (seat.topAt(seatMid) + seat.bottomAt(seatMid)) / 2,
    z: seatMid,
  };
  const allEdges = { u0: true, u1: true, v0: true, v1: true };
  surface((u, v) => {
    const x = sx(u);
    const z = seat.backAt(x) * v;
    return { x, y: seat.topAt(z), z };
  }, { edges: allEdges, extras: seatExtras, role: 'seat-top', centre: seatCentre });
  surface((u, v) => {
    const x = sx(u);
    const z = seat.backAt(x) * v;
    return { x, y: seat.bottomAt(z), z };
  }, { edges: allEdges, centre: seatCentre });
  surface((u, v) => ({ x: sx(u), y: lerp(seat.bottomAt(0), seat.topAt(0), v), z: 0 }),
    { edges: { u0: true, u1: true }, centre: seatCentre });      // front face
  surface((u, v) => {
    const x = sx(u);
    const z = seat.backAt(x);
    return { x, y: lerp(seat.bottomAt(z), seat.topAt(z), v), z };
  }, { edges: { u0: true, u1: true }, centre: seatCentre });      // back / side chain
  for (const x of [seat.xMin, seat.xMax]) {
    const zb = seat.backAt(x);
    surface((u, v) => {
      const z = zb * u;
      return { x, y: lerp(seat.bottomAt(z), seat.topAt(z), v), z };
    }, { edges: { u0: true, u1: true }, centre: seatCentre });
  }

  // --- arms -----------------------------------------------------------------
  if (arms && arms.bow) {
    // v0.2 armbow: the sampled centreline, projected as a band at `aboveSeat`.
    // Every segment contributes its own four faces, each pushed with its own
    // depth, so the bow sorts against the seat and the sticks segment by
    // segment — the same rule the meshed surfaces above follow.
    const bow = arms.bow;
    const L = bow.band.left;
    const R = bow.band.right;
    const quad = (a, b, c, d) => {
      const c3 = [a, b, c, d];
      const scr = c3.map((q) => p.at(q));
      let dep = 0;
      for (const q of c3) dep += p.depth(q);
      return { scr, depth: dep / 4 };
    };
    for (let i = 0; i < L.length - 1; i += 1) {
      const yT = arms.topY;
      const yB = arms.botY;
      const l0 = { x: L[i].x, z: L[i].z };
      const l1 = { x: L[i + 1].x, z: L[i + 1].z };
      const r0 = { x: R[i].x, z: R[i].z };
      const r1 = { x: R[i + 1].x, z: R[i + 1].z };
      const at = (q, y) => ({ x: q.x, y, z: q.z });
      const faces = [
        [at(l0, yT), at(r0, yT), at(r1, yT), at(l1, yT)],      // top
        [at(l0, yB), at(r0, yB), at(r1, yB), at(l1, yB)],      // underside
        [at(l0, yT), at(l0, yB), at(l1, yB), at(l1, yT)],      // outer wall
        [at(r0, yT), at(r0, yB), at(r1, yB), at(r1, yT)],      // inner wall
      ];
      faces.forEach((f, fi) => {
        const q = quad(...f);
        let svg = polygon(grown(q.scr), {
          ...fillOnly, ...(fi === 0 ? { 'data-role': 'arm-bow-top' } : {}),
        });
        if (fi === 0) {
          // the two long edges of the top face carry the bow's outline
          svg += `\n${polyline([q.scr[0], q.scr[3]], edgeStroke)}`;
          svg += `\n${polyline([q.scr[1], q.scr[2]], edgeStroke)}`;
        }
        push(q.depth, svg, q.scr);
      });
    }
    // short spindles, seat top to the bow underside
    for (const s of bow.spindles) {
      rod({ x: s.x, y: seat.topAt(s.z), z: s.z }, { x: s.x, y: arms.botY, z: s.z },
        bow.spindleDiameter, bow.spindleDiameter, { role: 'bow-spindle' });
    }
  }
  if (arms) {
    for (const b of arms.boards) {
      const bx = (u) => lerp(b.xMin, b.xMax, u);
      const bz = (v) => lerp(b.zMin, b.zMax, v);
      const all = { u0: true, u1: true, v0: true, v1: true };
      const c = {
        x: (b.xMin + b.xMax) / 2,
        y: (arms.botY + arms.topY) / 2,
        z: (b.zMin + b.zMax) / 2,
      };
      surface((u, v) => ({ x: bx(u), y: arms.topY, z: bz(v) }),
        { edges: all, extras: armExtras.get(b.side), role: `arm-top-${b.side}`, centre: c });
      surface((u, v) => ({ x: bx(u), y: arms.botY, z: bz(v) }), { edges: all, centre: c });
      surface((u, v) => ({ x: bx(u), y: lerp(arms.botY, arms.topY, v), z: b.zMin }), { edges: all, centre: c });
      surface((u, v) => ({ x: bx(u), y: lerp(arms.botY, arms.topY, v), z: b.zMax }), { edges: all, centre: c });
      surface((u, v) => ({ x: b.xMin, y: lerp(arms.botY, arms.topY, v), z: bz(u) }), { edges: all, centre: c });
      surface((u, v) => ({ x: b.xMax, y: lerp(arms.botY, arms.topY, v), z: bz(u) }), { edges: all, centre: c });
    }
  }

  // --- sticks ---------------------------------------------------------------
  const crestExtras = [];
  const cs = crest.section;
  for (const s of sticks.items) {
    rod(s.base, sticks.throughCrest ? s.atCrestBottom : s.top,
      sticks.diameter, sticks.diameter, { role: `stick-${s.index}` });
    if (sticks.throughCrest) {
      const r = sticks.diameter / 2;
      const through = ((sticks.lean - crest.tilt) * Math.PI) / 180;
      const tz = Math.cos((crest.tilt * Math.PI) / 180);
      const ty = -Math.sin((crest.tilt * Math.PI) / 180);
      const st = r / Math.cos(through);
      crestExtras.push({
        u: (s.top.x + crest.elevationLength / 2) / crest.elevationLength,
        v: 0.5,
        svg: tenonFace(s.top, { x: r, y: 0, z: 0 }, { x: 0, y: ty * st, z: tz * st }, true),
      });
    }
  }

  // --- crest, swept along X with the live edge riding its top --------------
  // `heightAt` is driven by the SAME profile the front elevation draws, so the
  // wavy comb top is identical in both views.
  const chw = crest.elevationLength / 2;
  const tiltRad = (crest.tilt * Math.PI) / 180;
  const uAxis = { z: Math.sin(tiltRad), y: Math.cos(tiltRad) };
  const heightAt = (x) => crest.height - crest.edgeDropAt(x) / Math.cos(tiltRad);
  const cx = (u) => lerp(-chw, chw, u);
  const stations = crest.edgeStations
    ? crest.edgeStations.map((x) => (x + chw) / crest.elevationLength)
    : null;
  // v0.2: a comb curved in plan sweeps along its centreline instead of along a
  // straight line. The cross-section is carried rigidly in z — the curve is
  // shallow enough that rotating the section with the tangent would move the
  // drawn edges by less than the linework is wide. A straight comb gets
  // dz = 0 and the identical geometry it always had.
  const dzAt = crest.planCurve
    ? (x) => crest.planCurve.zAtX(x) - crest.bottomZ
    : () => 0;
  const botFrontZ = (x) => cs.bottomFront.z + dzAt(x);
  const botBackZ = (x) => cs.bottomBack.z + dzAt(x);
  const topFrontAt = (x) => ({
    x, y: cs.bottomFront.y + uAxis.y * heightAt(x), z: botFrontZ(x) + uAxis.z * heightAt(x),
  });
  const topBackAt = (x) => ({
    x, y: cs.bottomBack.y + uAxis.y * heightAt(x), z: botBackZ(x) + uAxis.z * heightAt(x),
  });
  const both = { u0: true, u1: true, v0: true, v1: true };
  const crestCentre = {
    x: 0,
    y: (cs.bottomFront.y + cs.bottomBack.y) / 2 + (uAxis.y * heightAt(0)) / 2,
    z: (botFrontZ(0) + botBackZ(0)) / 2 + (uAxis.z * heightAt(0)) / 2,
  };
  // bottom
  surface((u, v) => {
    const x = cx(u);
    return {
      x,
      y: lerp(cs.bottomFront.y, cs.bottomBack.y, v),
      z: lerp(botFrontZ(x), botBackZ(x), v),
    };
  }, { edges: both, centre: crestCentre });
  // front face
  surface((u, v) => {
    const x = cx(u);
    const t = topFrontAt(x);
    return { x, y: lerp(cs.bottomFront.y, t.y, v), z: lerp(botFrontZ(x), t.z, v) };
  }, { edges: both, uStations: stations, centre: crestCentre });
  // back face
  surface((u, v) => {
    const x = cx(u);
    const t = topBackAt(x);
    return { x, y: lerp(cs.bottomBack.y, t.y, v), z: lerp(botBackZ(x), t.z, v) };
  }, { edges: both, uStations: stations, centre: crestCentre });
  // top face, carrying the stick tenons; its v0 border IS the live edge
  surface((u, v) => {
    const x = cx(u);
    const a = topFrontAt(x);
    const b = topBackAt(x);
    return { x, y: lerp(a.y, b.y, v), z: lerp(a.z, b.z, v) };
  }, {
    edges: both,
    extras: crestExtras,
    uStations: stations,
    topStyle: crest.liveEdge ? liveEdgeStroke : edgeStroke,
    role: 'crest-top',
    centre: crestCentre,
  });
  // end caps
  for (const x of [-chw, chw]) {
    const a = topFrontAt(x);
    const b = topBackAt(x);
    surface((u, v) => ({
      x,
      y: lerp(lerp(cs.bottomFront.y, cs.bottomBack.y, u), lerp(a.y, b.y, u), v),
      z: lerp(lerp(botFrontZ(x), botBackZ(x), u), lerp(a.z, b.z, u), v),
    }), { edges: both, centre: crestCentre });
  }

  // --- paint far -> near ----------------------------------------------------
  items.sort((a, b) => (a.depth === b.depth ? a.seq - b.seq : a.depth - b.depth));
  for (const it of items) geo.add(it.svg, it.pts);

  return finish('axo', 'AXONOMETRIC', geo, null);
}
