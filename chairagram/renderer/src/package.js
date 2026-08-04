// package.js — assemble the drawing sheet and the machine-readable outputs.

import {
  PALETTE, FONT, STROKE, PX_PER_IN, unitWord, tableAngle,
} from './style.js';
import { svgDocument, group, text, line, rect, num } from './svg.js';
import { sidePanel, frontPanel, planPanel, axoPanel } from './panels.js';
import { AXO_AZIMUTH, AXO_ELEVATION } from './project.js';
import {
  normalizeProvenance, provenanceBlock, provenanceJson, bannerStrip,
  watermarkSvg, artifactName,
} from './provenance.js';

const MARGIN = 40;
const GUTTER = 64;
const ROW_GAP = 54;

/**
 * One <g> per panel carrying the panel's absolute sheet translate — panels emit
 * no nested groups, so tests can read absolute coordinates straight off it.
 */
function place(panel, x, y) {
  return group({
    'data-panel': panel.name,
    transform: `translate(${num(x + panel.offset.x)},${num(y + panel.offset.y)})`,
  }, panel.content);
}

/**
 * Angle table: one row per leg group plus the stick row, each row printed in
 * BOTH frames (DECISIONS D11, Lewis's call).
 *
 * Left half is what the spec stores — the member measured against the floor.
 * Right half is the same member measured against the SEAT, which is the surface
 * a chairmaker actually bores from, so it is the half you set a bevel gauge to.
 * Both are labelled on the sheet; neither is left to be guessed at.
 */
function angleTable(model, x, y, width) {
  const rows = [
    ...model.derived.legGroups.map((g) => ({
      what: `${g.group} legs`,
      floor: g,
      seat: g.seat,
    })),
    {
      what: 'stick row',
      floor: { rake: model.sticks.lean, splay: 0, ...model.sticks.angles },
      seat: { rake: model.sticks.angleOffSeatPerpendicular, splay: 0, ...model.sticks.seatAngles },
    },
  ];
  const LABEL = 0;
  const FLOOR = [128, 202, 288, 374];
  const SEAT = [500, 574, 660, 746];
  const cols = [LABEL, ...FLOOR, ...SEAT].map((c) => x + c);
  const head = ['', 'rake', 'splay', 'sightline', 'resultant',
    'rake', 'splay', 'sightline', 'resultant'];
  const out = [];
  const lh = 19;
  const slope = model.derived.seatSlope;
  const tilt = slope >= 0 ? 'down toward the back' : 'down toward the front';

  out.push(text(x, y, 'ANGLE TABLE — bevel-gauge settings', {
    size: FONT.caption, fill: PALETTE.caption, weight: 'normal', letterSpacing: 2,
  }));
  // group headers: which datum each half of the table is measured from
  let cy = y + 20;
  const groupHead = (from, to, label) => {
    const a = x + from;
    const b = x + to;
    out.push(text((a + b) / 2, cy, label, {
      size: FONT.smallNote, fill: PALETTE.subInk, anchor: 'middle',
    }));
    out.push(line(a - 46, cy + 4, b, cy + 4, {
      stroke: PALETTE.rule, 'stroke-width': STROKE.rule.toFixed(1),
    }));
  };
  groupHead(FLOOR[0], FLOOR[3], 'from the floor  (as stored)');
  groupHead(SEAT[0], SEAT[3], 'DRILLING — from the seat plane');

  cy += 19;
  head.forEach((h, i) => {
    if (!h) return;
    out.push(text(cols[i], cy, h, { size: FONT.table, fill: PALETTE.subInk, anchor: 'end' }));
  });
  out.push(line(x, cy + 6, x + width, cy + 6, {
    stroke: PALETTE.rule, 'stroke-width': STROKE.rule.toFixed(1),
  }));
  cy += lh + 4;
  for (const r of rows) {
    out.push(text(cols[0], cy, r.what, { size: FONT.table, fill: PALETTE.ink }));
    const vals = [
      r.floor.rake, r.floor.splay, r.floor.sightline, r.floor.resultant,
      r.seat.rake, r.seat.splay, r.seat.sightline, r.seat.resultant,
    ];
    vals.forEach((v, i) => {
      out.push(text(cols[i + 1], cy, `${tableAngle(v)}°`, {
        size: FONT.table, fill: PALETTE.dim, anchor: 'end', weight: '600',
      }));
    });
    out.push(line(x, cy + 6, x + width, cy + 6, {
      stroke: PALETTE.rule, 'stroke-width': '0.4',
    }));
    cy += lh;
  }
  const notes = [
    'sightline measured off the seat’s transverse (side-to-side) baseline; resultant is the angle off vertical',
    `drilling angles are the same members read against the seat — the surface you bore from. This seat sits ${tableAngle(Math.abs(slope))}° off the floor, sloping ${tilt}.`,
    'a leg runs DOWN through the seat so that slope ADDS to its rake; a stick runs UP so it SUBTRACTS — one board, opposite members.',
  ];
  notes.forEach((n, i) => {
    out.push(text(x, cy + 8 + i * 12, n, { size: FONT.smallNote, fill: PALETTE.aside }));
  });
  return { svg: out.join('\n'), height: cy + 8 + (notes.length - 1) * 12 - y };
}

/**
 * Derived quantities, machine-readable (SPEC.md § Derived quantities).
 *
 * `opts.provenance` is additive: given one, the file gains a top-level
 * "provenance" object saying exactly what the sheet prints; without one the
 * bytes are what they always were.
 */
export function buildAngles(model, specName, { provenance = null } = {}) {
  const { derived, sticks, crest, seat, arms } = model;
  const prov = normalizeProvenance(provenance);
  return {
    specVersion: model.spec.meta.specVersion,
    name: model.spec.meta.name,
    units: model.units,
    spec: specName,
    ...(prov ? { provenance: provenanceJson(prov) } : {}),
    datum: {
      sightline: 'transverse',
      note: 'sightline measured off the seat transverse (side-to-side) baseline; splay-only leg = 0 deg, rake-only leg = 90 deg. TODO: verify against Chairpanzee/Galbert.',
      // Every angle is given twice. The top-level rake/splay/sightline/resultant
      // are the stored floor-frame values (SPEC.md, unchanged); `seatFrame` on
      // the same object is the member read against the seat — the drilling
      // frame. DECISIONS D11/D17.
      frames: {
        stored: 'floor',
        drilling: 'seatFrame',
        seatSlopeDeg: round3(derived.seatSlope),
        note: 'seatSlopeDeg is positive when the seat is HIGHER AT THE FRONT and slopes down toward the back. A leg runs down through the seat so seatFrame.rakeDeg = rakeDeg + seatSlopeDeg exactly; a stick runs up so its lean has the slope subtracted. Splay is rotated, not copied: tan(splay_seat) = tan(splay) * cos(rake) / cos(rake_seat), which is identity when either is zero.',
      },
    },
    // v0.2 keys appear ONLY when the member they describe exists, so a v0.1
    // chair's angles.json is byte-for-byte what it always was.
    seat: {
      slopeDeg: round3(derived.seatSlope),
      topAtStickRow: round3(derived.seatTopAtSticks),
      heightFront: seat.heightFront,
      heightBack: seat.heightBack,
      width: round3(seat.width),
      depth: round3(seat.depth),
      ...(seat.traced ? { planType: 'outline', outlineSamples: seat.outline.length } : {}),
    },
    legs: model.legs.map((l) => ({
      id: l.id,
      group: l.group,
      mortise: { x: l.mortise.x, z: l.mortise.z },
      rakeDeg: round3(l.rake),
      splayDeg: round3(l.splay),
      sightlineDeg: round3(l.angles.sightline),
      resultantDeg: round3(l.angles.resultant),
      seatFrame: seatFrameJson(l.seatAngles),
      footOffset: { x: round3(l.foot.x - l.mortise.x), z: round3(l.foot.z - l.mortise.z) },
    })),
    legGroups: derived.legGroups.map((g) => ({
      group: g.group,
      rakeDeg: round3(g.rake),
      splayDeg: round3(g.splay),
      sightlineDeg: round3(g.sightline),
      resultantDeg: round3(g.resultant),
      seatFrame: seatFrameJson(g.seat),
    })),
    sticks: {
      count: sticks.count,
      pitch: round3(derived.stickPitch),
      leanDeg: round3(sticks.lean),
      leanOffSeatPerpendicularDeg: round3(sticks.angleOffSeatPerpendicular),
      sightlineDeg: round3(sticks.angles.sightline),
      resultantDeg: round3(sticks.angles.resultant),
      // `rakeDeg` here IS leanOffSeatPerpendicularDeg — repeated under the same
      // key the legs use so a consumer can read one shape for every member.
      seatFrame: seatFrameJson(sticks.seatAngles),
      alongStickToCrestBottom: round3(derived.alongStickToCrestBottom),
      alongStickTotal: round3(derived.alongStickTotal),
      throughCrest: sticks.throughCrest,
    },
    crest: {
      tiltRef: crest.tiltRef,
      tiltDeg: round3(crest.tilt),
      liveEdge: crest.liveEdge,
      ...(crest.planCurve ? {
        planCurve: {
          alongLength: round3(crest.planCurve.alongLength),
          chord: round3(crest.planCurve.chord),
          apexDepth: round3(crest.planCurve.apexDepth),
          // null means no single circle fits within tolerance — the drawing
          // says "varies", and so does this.
          radius: crest.planCurve.radius === null ? null : round3(crest.planCurve.radius),
          maxDeviationFromArc: round3(crest.planCurve.maxDeviation),
          samples: crest.planCurve.points.length,
        },
      } : {}),
    },
    arms: arms
      ? {
        style: arms.style,
        aboveSeat: arms.aboveSeat,
        length: round3(arms.length),
        lengthDerived: arms.lengthDerived,
        insideWidth: round3(arms.insideWidth),
        outsideWidth: round3(arms.outsideWidth),
        ...(arms.bow ? {
          bow: {
            section: arms.bow.section,
            span: round3(arms.bow.span),
            apexDepth: round3(arms.bow.apexDepth),
            alongLength: round3(arms.bow.alongLength),
            tipZ: round3(arms.bow.tipZ),
            apexZ: round3(arms.bow.apexZ),
            spindleCount: arms.bow.spindleCount,
            spindleDiameter: arms.bow.spindleDiameter,
            spindlePitch: round3(arms.bow.spindlePitch),
            spindles: arms.bow.spindles.map((s) => ({ x: round3(s.x), z: round3(s.z) })),
            samples: arms.bow.points.length,
          },
        } : {}),
      }
      : null,
    overallHeight: round3(derived.overallHeight),
  };
}

function round3(v) {
  return v === null || v === undefined ? v : Math.round(v * 1000) / 1000;
}

/** The drilling-frame block, identical in shape wherever it appears. */
function seatFrameJson(a) {
  return {
    rakeDeg: round3(a.rake),
    splayDeg: round3(a.splay),
    sightlineDeg: round3(a.sightline),
    resultantDeg: round3(a.resultant),
  };
}

/**
 * The whole sheet.svg.
 *
 * `opts.provenance` (RENDERER.md, artifact provenance) decides what this sheet
 * is allowed to call itself. WITHOUT it every byte below is what it always
 * was — that is the whole reason the option is optional.
 */
export function buildSheet(model, { specName = 'spec.json', provenance = null } = {}) {
  const prov = normalizeProvenance(provenance);
  const side = sidePanel(model);
  const front = frontPanel(model);
  const plan = planPanel(model);
  const axo = axoPanel(model);

  const row1H = Math.max(side.height, front.height);
  const row2H = Math.max(plan.height, axo.height);
  const row1W = side.width + GUTTER + front.width;
  const row2W = plan.width + GUTTER + axo.width;

  const headerH = 92;
  // wide enough that the row rules run under BOTH halves of the angle table
  // (floor frame and drilling frame) — the rules are what tie a row together
  const tableW = 790;
  const contentW = Math.max(row1W, row2W, tableW);
  const sheetW = contentW + MARGIN * 2;

  // A partly-measured sheet carries a strip under the title block. It is never
  // drawn OVER the drawing — the panels move down by exactly its height, so it
  // is impossible for it to hide the thing it is warning about.
  const banner = bannerStrip(prov, MARGIN, MARGIN + headerH - 26, contentW);
  const bannerH = banner.height ? banner.height + 8 : 0;

  const y1 = MARGIN + headerH + bannerH;
  const y2 = y1 + row1H + ROW_GAP;
  const yTable = y2 + row2H + ROW_GAP;

  const table = angleTable(model, MARGIN, yTable + 12, tableW);
  const footerY = yTable + 12 + table.height + 40;
  // The provenance block goes between the footer rule and the standing footer
  // row. No provenance -> no lines, no pixels, no change.
  const provBlock = provenanceBlock(prov, MARGIN, footerY);
  const footRowY = footerY + (provBlock.lines ? provBlock.height + 22 : 0);
  const sheetH = footRowY + 26;

  const units = model.units;
  const scaleNote = units === 'mm'
    ? `drawn to scale (${PX_PER_IN} px = 1 in = ${(PX_PER_IN / 25.4).toFixed(3)} px/mm)`
    : `drawn to scale (${PX_PER_IN} px = 1 in)`;

  const artifact = artifactName(prov);
  const mark = watermarkSvg(prov, sheetW, sheetH);
  const children = [
    rect(0, 0, sheetW, sheetH, { fill: PALETTE.paper }),
    text(MARGIN, MARGIN - 4, `${model.spec.meta.name} — ${artifact}`, {
      size: FONT.title, fill: PALETTE.ink, weight: 'bold',
    }),
    text(MARGIN, MARGIN + 17, [
      'side + front elevations · seat plan · axonometric inset',
      scaleNote,
      `dimensions in ${unitWord(units)}`,
    ].join(' · '), { size: FONT.subtitle, fill: PALETTE.subInk }),
    text(MARGIN, MARGIN + 35, `spec: ${specName}${model.spec.meta.notes ? ` · ${firstClause(model.spec.meta.notes)}` : ''}`, {
      size: FONT.smallNote, fill: PALETTE.aside,
    }),
    line(MARGIN, MARGIN + 46, sheetW - MARGIN, MARGIN + 46, {
      stroke: PALETTE.rule, 'stroke-width': STROKE.rule.toFixed(1),
    }),
    ...(banner.svg ? [banner.svg] : []),

    place(side, MARGIN, y1),
    place(front, MARGIN + side.width + GUTTER, y1),
    place(plan, MARGIN, y2),
    place(axo, MARGIN + plan.width + GUTTER, y2),
    text(MARGIN + plan.width + GUTTER, y2 - 6,
      `parallel projection along the seat diagonal — azimuth ${AXO_AZIMUTH}°, elevation ${AXO_ELEVATION}°`,
      { size: FONT.smallNote, fill: PALETTE.aside }),
    table.svg,

    line(MARGIN, footerY - 18, sheetW - MARGIN, footerY - 18, {
      stroke: PALETTE.rule, 'stroke-width': STROKE.rule.toFixed(1),
    }),
    ...(provBlock.svg ? [provBlock.svg] : []),
    // Still a placeholder — a designed scale-check audit fills it later. The
    // live answer is under the sheet in the app (drawing.js).
    text(MARGIN, footRowY, 'scale check: —', { size: FONT.note, fill: PALETTE.subInk }),
    text(sheetW - MARGIN, footRowY, 'not a substitute for final shop drawings.', {
      size: FONT.note, fill: PALETTE.subInk, anchor: 'end',
    }),
    // Last, so it lies over the drawing rather than under it.
    ...(mark ? [mark] : []),
  ];

  return svgDocument({
    width: num(sheetW),
    height: num(sheetH),
    viewBox: `0 0 ${num(sheetW)} ${num(sheetH)}`,
    title: `${model.spec.meta.name} — ${artifact}`,
    children,
  });
}

function firstClause(s) {
  const cut = s.indexOf('.');
  return cut > 0 ? s.slice(0, cut) : s;
}

export { MARGIN, GUTTER };
