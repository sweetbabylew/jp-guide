// seatPattern.js — the seat plan at TRUE SIZE.
//
// The viewBox is in drawing pixels (10 px = 1 in) and width/height carry real
// physical units, so a 100% print measures 1:1 on the bench. Tiling into a
// multi-page PDF comes later (RENDERER.md non-goals).

import {
  PALETTE, DASH, FONT, PX_PER_IN, MM_PER_IN, formatLength, formatAngle, tableAngle,
} from './style.js';
import {
  svgDocument, line, polygon, circle, text, rect, num,
} from './svg.js';
import { makeProjector } from './project.js';
import {
  normalizeProvenance, provenanceBlock, bannerStrip, watermarkSvg, artifactName,
} from './provenance.js';

const MARGIN = 22;      // px  = 2.2 in of paper around the pattern
const NOTE_H = 96;      // px  reserved above the pattern for the note block

/** Physical size string for the width/height attributes. */
function physical(px, units) {
  const inches = px / PX_PER_IN;
  return units === 'mm'
    ? `${(inches * MM_PER_IN).toFixed(2)}mm`
    : `${inches.toFixed(3)}in`;
}

export function buildSeatPattern(model, { specName = 'spec.json', provenance = null } = {}) {
  const units = model.units;
  const p = makeProjector('plan', units);
  const k = p.scale;
  const { seat, sticks } = model;
  // This is the artifact people CUT AROUND, so it gets the same provenance the
  // sheet does — a 1:1 fabrication pattern of a chair nobody measured is the
  // worst thing this project can print. No provenance -> byte-for-byte as before.
  const prov = normalizeProvenance(provenance);

  const outlineU = seat.outline;
  const xs = outlineU.map((q) => q.x);
  const zs = outlineU.map((q) => q.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  // Pattern-local origin. The seat FRONT edge sits at the BOTTOM of the sheet,
  // matching the SEAT PLAN panel on sheet.svg so the two read the same way up.
  const W = (maxX - minX) * k + MARGIN * 2;
  // Provenance band: strip (partial only) then the lines, between the note
  // block and the pattern. It grows the paper; the pattern is still 1:1.
  const bandTop = MARGIN + NOTE_H - 12;
  const strip = bannerStrip(prov, MARGIN, bandTop, W - MARGIN * 2);
  const provBlock = provenanceBlock(prov, MARGIN, bandTop + strip.height
    + (strip.height ? 10 : 0) + 10, { step: 13 });
  const bandH = strip.height + (strip.height ? 10 : 0)
    + (provBlock.lines ? provBlock.height + 14 : 0);
  const top = MARGIN + NOTE_H + bandH;
  const ox = MARGIN - minX * k;
  const oy = top + maxZ * k;         // z = 0 (front edge)
  const at = (x, z) => ({ x: ox + x * k, y: oy - z * k });

  const H = (maxZ - minZ) * k + top + MARGIN;

  const thin = { stroke: PALETTE.woodStroke, 'stroke-width': '1.0', fill: 'none' };
  const out = [rect(0, 0, W, H, { fill: PALETTE.paper })];

  // --- note block -----------------------------------------------------------
  out.push(text(MARGIN, MARGIN + 4, `${model.spec.meta.name} — seat plan, true size (1:1)`, {
    size: 15, fill: PALETTE.ink, weight: 'bold',
  }));
  out.push(text(MARGIN, MARGIN + 22, 'PRINT AT 100% — never "fit to page". Check the ruler below before cutting.', {
    size: FONT.note, fill: PALETTE.subInk,
  }));
  out.push(text(MARGIN, MARGIN + 38, [
    `${formatLength(seat.width, units)} × ${formatLength(seat.depth, units)} ${units}`,
    seat.traced ? 'traced outline — width and depth are its extents' : null,
    `${sticks.count} sticks at ${formatLength(model.derived.stickPitch, units)} centres`,
    `spec: ${specName}`,
  ].filter(Boolean).join(' · '), { size: FONT.note, fill: PALETTE.subInk }));

  // verification ruler
  const rulerUnits = units === 'mm' ? 150 : 6;
  const rulerY = MARGIN + 62;
  const rulerLen = rulerUnits * k;
  out.push(line(MARGIN, rulerY, MARGIN + rulerLen, rulerY, {
    stroke: PALETTE.ink, 'stroke-width': '1.0',
  }));
  const step = units === 'mm' ? 10 : 1;
  for (let i = 0; i <= rulerUnits; i += step) {
    const x = MARGIN + i * k;
    out.push(line(x, rulerY, x, rulerY - 6, { stroke: PALETTE.ink, 'stroke-width': '1.0' }));
  }
  out.push(text(MARGIN + rulerLen + 8, rulerY + 4,
    `${rulerUnits} ${units} — measure me`, { size: FONT.note, fill: PALETTE.subInk }));

  // --- provenance band ------------------------------------------------------
  if (strip.svg) out.push(strip.svg);
  if (provBlock.svg) out.push(provBlock.svg);

  // --- seat outline ---------------------------------------------------------
  const ring = outlineU.map((q) => at(q.x, q.z));
  out.push(polygon(ring, { ...thin, 'stroke-width': '1.6', 'data-role': 'seat-outline' }));

  // --- centreline -----------------------------------------------------------
  const c0 = at(0, minZ - 1.2);
  const c1 = at(0, maxZ + 1.2);
  out.push(line(c0.x, c0.y, c1.x, c1.y, {
    stroke: PALETTE.dim, 'stroke-width': '0.8', 'stroke-dasharray': '9,3,2,3',
    'data-role': 'centreline',
  }));

  // --- sightlines from every mortise ---------------------------------------
  for (const leg of model.legs) {
    const m = at(leg.mortise.x, leg.mortise.z);
    const d = leg.sightDir;
    let dir = { x: 0, y: -1 };
    if (d.defined) {
      const q = at(leg.mortise.x + d.x, leg.mortise.z + d.z);
      const len = Math.hypot(q.x - m.x, q.y - m.y) || 1;
      dir = { x: (q.x - m.x) / len, y: (q.y - m.y) / len };
    }
    const reach = 4.5 * k;
    out.push(line(m.x - dir.x * reach, m.y - dir.y * reach, m.x + dir.x * reach, m.y + dir.y * reach, {
      stroke: PALETTE.dim, 'stroke-width': '1.0', 'stroke-dasharray': DASH.sight,
      'data-role': `sightline-${leg.id}`,
    }));
    // mortise centre: crosshair + circle
    const r = (leg.section * k) / 2;
    out.push(circle(m.x, m.y, r, { fill: 'none', stroke: PALETTE.dim, 'stroke-width': '1.0' }));
    out.push(line(m.x - r - 5, m.y, m.x + r + 5, m.y, { stroke: PALETTE.dim, 'stroke-width': '0.8' }));
    out.push(line(m.x, m.y - r - 5, m.x, m.y + r + 5, { stroke: PALETTE.dim, 'stroke-width': '0.8' }));
    // Labels run toward the centreline (so they always stay on the sheet) and
    // stack in three short lines (so opposite mortises never collide).
    const inward = leg.mortise.x >= 0 ? -1 : 1;
    const lx = m.x + inward * (r + 8);
    const anchor = inward > 0 ? 'start' : 'end';
    const lines = [
      leg.id,
      `sight ${formatAngle(leg.angles.sightline)}`,
      `resultant ${tableAngle(leg.angles.resultant)}°`,
    ];
    lines.forEach((s, i) => {
      out.push(text(lx, m.y - 10 + i * 11, s, {
        size: FONT.smallNote, fill: PALETTE.dim, anchor,
      }));
    });
  }

  // --- stick row ------------------------------------------------------------
  for (const s of sticks.items) {
    const c = at(s.x, sticks.rowZ);
    out.push(circle(c.x, c.y, (sticks.diameter * k) / 2, {
      fill: 'none', stroke: PALETTE.tenonStroke, 'stroke-width': '1.0',
    }));
  }
  const rowL = at(seat.xMin, sticks.rowZ);
  const rowR = at(seat.xMax, sticks.rowZ);
  out.push(line(rowL.x, rowL.y, rowR.x, rowR.y, {
    stroke: PALETTE.tenonStroke, 'stroke-width': '0.6', 'stroke-dasharray': DASH.ext,
  }));
  out.push(text(rowR.x - 4, rowR.y - 6,
    `stick row — ${formatLength(sticks.rowZ, units)} off the front edge`, {
      size: FONT.smallNote, fill: PALETTE.tenonStroke, anchor: 'end',
    }));

  out.push(text(MARGIN, H - 8, 'not a substitute for final shop drawings.', {
    size: FONT.smallNote, fill: PALETTE.aside,
  }));

  // last, so it lies over the pattern rather than under it
  const mark = watermarkSvg(prov, W, H);
  if (mark) out.push(mark);

  return svgDocument({
    width: physical(W, units),
    height: physical(H, units),
    viewBox: `0 0 ${num(W)} ${num(H)}`,
    title: prov
      ? `${model.spec.meta.name} — seat pattern, true size — ${artifactName(prov)}`
      : `${model.spec.meta.name} — seat pattern, true size`,
    children: out,
  });
}
