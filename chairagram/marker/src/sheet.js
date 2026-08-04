// sheet.js — variant -> { elements, manifest, svg }.
//
// PURE. No DOM, no fs, no Date, no random. Same output bytes every run.
//
// ---------------------------------------------------------------------------
// Two coordinate frames
// ---------------------------------------------------------------------------
// PAGE mm  — SVG user units. Origin at the top-left paper corner, y down.
//            Used by `elements` and by the SVG itself, because that is what a
//            printer wants.
// SHEET mm — the contract with detection (MARKER.md). Origin at the CENTRE of
//            the SEAT FRONT datum line, +X right, +Y toward the back. Used by
//            everything in `manifest`.
//
//   sheetX = pageX - origin.x        pageX = origin.x + sheetX
//   sheetY = origin.y - pageY        pageY = origin.y - sheetY
//
// The manifest is the single source of truth for detection. Nothing downstream
// should re-derive a millimetre from the constants in this file.
//
// ---------------------------------------------------------------------------
// Where the printed frame sits
// ---------------------------------------------------------------------------
// The 12 mm margin is measured to the OUTERMOST INK on every side. On three
// sides that is the printed frame itself. On the front side the outermost ink
// is the front half of the 1 mm datum line, so the printed frame's front edge
// — which is also the datum line's centre line, and therefore sheet Y = 0 —
// sits 12.5 mm from the paper edge. That is the only reason the frame height
// is (paper - 24 - 0.5) rather than (paper - 24).
//
// The paper edge is never a datum. Printer centring shifts everything printed
// as a rigid body, and the ruler absorbs uniform scale.

import { bitmap, FAMILY } from './tags36h11.js';

// ---------------------------------------------------------------------------
// Design constants (the tag size is the hypothesis MARKER.md asks us to test)
// ---------------------------------------------------------------------------

export const MARGIN_MM = 12;
/** Printed tag bitmap edge length. 10 modules => 6 mm per module. */
export const TAG_SIZE_MM = 60;
/**
 * Extra white kept clear of the tag bitmap on every side. The bitmap already
 * carries tag36h11's own 1-module white ring, so ink stays >= 2 modules from
 * the black border.
 */
export const QUIET_MM = 6;
export const DATUM_WIDTH_MM = 1;
export const TICK_LEN_MM = 12;
export const TICK_WIDTH_MM = 0.8;
/** Nothing on the sheet is thinner than this (MARKER.md: no hairlines). */
export const MIN_STROKE_MM = 0.5;

const RULE_MM = 0.6;   // ticks, dashes, box outline
const BAR_H_MM = 3;    // ruler bar height

export const VARIANTS = Object.freeze({
  letter: Object.freeze({
    name: 'letter',
    label: 'US Letter (landscape)',
    widthMm: 279.4,
    heightMm: 215.9,
    // corner order: front-left, front-right, back-right, back-left
    tagIds: Object.freeze([0, 1, 2, 3]),
  }),
  a4: Object.freeze({
    name: 'a4',
    label: 'A4 (landscape)',
    widthMm: 297,
    heightMm: 210,
    tagIds: Object.freeze([10, 11, 12, 13]),
  }),
});

export const VARIANT_NAMES = Object.freeze(Object.keys(VARIANTS));

/** Tag roles, in the order MARKER.md lists the IDs. */
export const TAG_ROLES = Object.freeze(['front-left', 'front-right', 'back-right', 'back-left']);

/**
 * The order AprilTag returns quad corners in, expressed in the SHEET frame.
 *
 * apriltag's det->p is fixed in the tag's own frame, and every tag on this
 * sheet is printed unrotated, so corner k always means the same physical
 * corner no matter how the photo is turned. Measured in test.mjs
 * ("corner convention"), not assumed.
 */
export const DETECTOR_CORNER_ORDER = Object.freeze(['-X-Y', '+X-Y', '+X+Y', '-X+Y']);

/** Which paper a set of detected IDs came from, or null. */
export function variantForIds(ids) {
  const seen = new Set(ids);
  for (const v of Object.values(VARIANTS)) {
    if (v.tagIds.some((id) => seen.has(id))) return v.name;
  }
  return null;
}

/** Role of a tag ID within its sheet, or null. */
export function roleForId(id) {
  for (const v of Object.values(VARIANTS)) {
    const i = v.tagIds.indexOf(id);
    if (i >= 0) return TAG_ROLES[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// number formatting — one place, so SVG and manifest never disagree
// ---------------------------------------------------------------------------

/** Round to 1e-4 mm (100 nm) and drop trailing zeros. Deterministic. */
export function q(v) {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

const n = (v) => String(q(v));

const esc = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// the sheet
// ---------------------------------------------------------------------------

/**
 * Build one variant.
 *
 * @param {string} variantName 'letter' | 'a4'
 * @returns {{variant:string,paper:object,elements:Array,manifest:object,svg:string}}
 */
export function buildSheet(variantName) {
  const V = VARIANTS[variantName];
  if (!V) throw new Error(`sheet: unknown variant "${variantName}" (have ${VARIANT_NAMES.join(', ')})`);

  const W = V.widthMm;
  const H = V.heightMm;
  const M = MARGIN_MM;
  const T = TAG_SIZE_MM;
  const Q = QUIET_MM;
  const halfDatum = DATUM_WIDTH_MM / 2;

  // Printed frame, in page mm. Its front edge is the datum line's centre.
  const frameLeft = M;
  const frameRight = W - M;
  const frameBack = M;                    // page y of the back edge
  const frameFront = H - M - halfDatum;   // page y of the front edge
  const Fw = frameRight - frameLeft;
  const Fh = frameFront - frameBack;

  const origin = { x: W / 2, y: frameFront };
  const toPage = (sx, sy) => ({ x: origin.x + sx, y: origin.y - sy });
  /** rect given in SHEET coords by its X range and Y range */
  const sheetRect = (id, x0, x1, y0, y1, cls) => ({
    type: 'rect',
    id,
    cls,
    x: q(origin.x + Math.min(x0, x1)),
    y: q(origin.y - Math.max(y0, y1)),
    w: q(Math.abs(x1 - x0)),
    h: q(Math.abs(y1 - y0)),
  });

  const halfW = Fw / 2;
  const freeHalfW = halfW - T - Q; // usable half-width between the corner tags

  const elements = [];
  const manifest = {
    format: 'chairagram.marker-manifest',
    version: 1,
    variant: V.name,
    label: V.label,
    units: 'mm',
    paper: {
      widthMm: q(W), heightMm: q(H), orientation: 'landscape', marginMm: q(M),
    },
    pageTransform: {
      originPageMm: { x: q(origin.x), y: q(origin.y) },
      note: 'sheetX = pageX - origin.x ; sheetY = origin.y - pageY (page mm, y down)',
    },
    frame: {
      xMinMm: q(-halfW), xMaxMm: q(halfW), yMinMm: 0, yMaxMm: q(Fh),
      widthMm: q(Fw), heightMm: q(Fh),
    },
  };

  // --- tags ----------------------------------------------------------------
  const moduleMm = T / FAMILY.totalWidth;
  const borderInsetMm = moduleMm * (FAMILY.totalWidth - FAMILY.widthAtBorder) / 2;
  const borderSizeMm = moduleMm * FAMILY.widthAtBorder;

  manifest.tagFamily = FAMILY.name;
  manifest.tag = {
    sizeMm: q(T),
    modules: FAMILY.totalWidth,
    moduleMm: q(moduleMm),
    widthAtBorderModules: FAMILY.widthAtBorder,
    /** the black square the detector actually locates */
    borderSizeMm: q(borderSizeMm),
    borderInsetMm: q(borderInsetMm),
    quietZoneMm: q(Q),
  };

  const tagOrigins = [
    { role: 'front-left', x0: -halfW, y0: 0 },
    { role: 'front-right', x0: halfW - T, y0: 0 },
    { role: 'back-right', x0: halfW - T, y0: Fh - T },
    { role: 'back-left', x0: -halfW, y0: Fh - T },
  ];

  manifest.tags = tagOrigins.map((t, i) => {
    const id = V.tagIds[i];
    const p = toPage(t.x0, t.y0 + T); // top-left in page coords
    elements.push({
      type: 'tag',
      id: `tag-${id}`,
      tagId: id,
      role: t.role,
      x: q(p.x),
      y: q(p.y),
      size: q(T),
      modules: FAMILY.totalWidth,
      cells: bitmap(id),
    });
    const bx0 = t.x0;
    const bx1 = t.x0 + T;
    const by0 = t.y0;
    const by1 = t.y0 + T;
    const cx0 = bx0 + borderInsetMm;
    const cx1 = bx1 - borderInsetMm;
    const cy0 = by0 + borderInsetMm;
    const cy1 = by1 - borderInsetMm;
    const inOrder = (x0, x1, y0, y1) => [
      { x: q(x0), y: q(y0) }, // -X -Y
      { x: q(x1), y: q(y0) }, // +X -Y
      { x: q(x1), y: q(y1) }, // +X +Y
      { x: q(x0), y: q(y1) }, // -X +Y
    ];
    return {
      id,
      role: t.role,
      /** outer corners of the printed 60 mm bitmap */
      corners: inOrder(bx0, bx1, by0, by1),
      /** outer corners of the black border square — what detect.js returns */
      borderCorners: inOrder(cx0, cx1, cy0, cy1),
      center: { x: q((bx0 + bx1) / 2), y: q((by0 + by1) / 2) },
    };
  });

  manifest.detection = {
    cornerOrder: [...DETECTOR_CORNER_ORDER],
    cornerOrderNote:
      'detect.js corner k matches manifest.tags[].borderCorners[k]; tags are printed unrotated '
      + 'so k is fixed to a physical corner regardless of camera roll',
    idsByRole: Object.fromEntries(TAG_ROLES.map((r, i) => [r, V.tagIds[i]])),
    frontEdge: { fromTagId: V.tagIds[0], toTagId: V.tagIds[1] },
    identifiesPaperSize: true,
  };

  // --- SEAT FRONT datum line ----------------------------------------------
  const datumX = freeHalfW;
  elements.push(sheetRect('datum-line', -datumX, datumX, -halfDatum, halfDatum, 'ink'));
  manifest.datum = {
    start: { x: q(-datumX), y: 0 },
    end: { x: q(datumX), y: 0 },
    widthMm: q(DATUM_WIDTH_MM),
    label: 'SEAT FRONT',
  };

  // --- centre ticks --------------------------------------------------------
  const tw = TICK_WIDTH_MM / 2;
  const midY = Fh / 2;
  const frontTickLen = 16;
  elements.push(sheetRect('tick-front', -tw, tw, -halfDatum, frontTickLen, 'ink'));
  elements.push(sheetRect('tick-back', -tw, tw, Fh - TICK_LEN_MM, Fh, 'ink'));
  elements.push(sheetRect('tick-left', -halfW, -halfW + TICK_LEN_MM, midY - tw, midY + tw, 'ink'));
  elements.push(sheetRect('tick-right', halfW - TICK_LEN_MM, halfW, midY - tw, midY + tw, 'ink'));

  // arrowhead on the front tick, pointing at the origin
  const arrowHalf = 3.5;
  const arrowLen = 7;
  elements.push({
    type: 'polygon',
    id: 'tick-front-arrow',
    cls: 'ink',
    points: [toPage(0, 0), toPage(-arrowHalf, arrowLen), toPage(arrowHalf, arrowLen)]
      .map((p) => ({ x: q(p.x), y: q(p.y) })),
  });

  manifest.ticks = {
    front: { x: 0, y: 0, lengthMm: q(frontTickLen), arrow: true },
    back: { x: 0, y: q(Fh), lengthMm: q(TICK_LEN_MM), arrow: false },
    left: { x: q(-halfW), y: q(midY), lengthMm: q(TICK_LEN_MM), arrow: false },
    right: { x: q(halfW), y: q(midY), lengthMm: q(TICK_LEN_MM), arrow: false },
  };

  // --- dashed centreline (front tick <-> back tick), broken for the text ---
  //
  // The centreline is a sighting aid, so it must not be crossed out by the
  // copy that shares the centre column: the datum labels at the front, the
  // instructions in the middle, and the whole verification-ruler block at the
  // back. Those three gaps are recorded in the manifest.
  const frontLabelTop = 38;   // above the SEAT FRONT / CENTER label stack
  const backBlockDepth = 65.5; // the ruler block reaches this far forward
  const gaps = [
    { y0: 0, y1: frontLabelTop },
    { y0: midY - 13, y1: midY + 12 },
    { y0: Fh - backBlockDepth, y1: Fh },
  ];
  const dashSpans = [
    [gaps[0].y1, gaps[1].y0],
    [gaps[1].y1, gaps[2].y0],
  ];
  const dashOn = 6;
  const dashOff = 4;
  let dashIdx = 0;
  for (const [a, b] of dashSpans) {
    for (let y = a; y < b - 1e-9; y += dashOn + dashOff) {
      const y1 = Math.min(y + dashOn, b);
      if (y1 - y < 1) continue;
      elements.push(sheetRect(`centerline-dash-${dashIdx}`, -RULE_MM / 2, RULE_MM / 2, y, y1, 'ink'));
      dashIdx += 1;
    }
  }
  manifest.centerline = {
    front: { x: 0, y: 0 },
    back: { x: 0, y: q(Fh) },
    strokeMm: q(RULE_MM),
    dashMm: [dashOn, dashOff],
    gaps: gaps.map((g) => ({ y0: q(g.y0), y1: q(g.y1) })),
  };

  // --- verification rulers -------------------------------------------------
  const rulers = [];
  const addRuler = (id, lengthMm, topY, majorMm, minorMm, endLabel, labelEveryMm, unitMm) => {
    const half = lengthMm / 2;
    const barY1 = topY;
    const barY0 = topY - BAR_H_MM;
    elements.push(sheetRect(`${id}-bar`, -half, half, barY0, barY1, 'ink'));
    let k = 0;
    for (let v = -half; v <= half + 1e-9; v += majorMm) {
      const isEnd = Math.abs(Math.abs(v) - half) < 1e-9;
      const wdt = isEnd ? 1 : RULE_MM;
      const len = isEnd ? 3.5 : 2.5;
      elements.push(sheetRect(`${id}-tick-${k}`, v - wdt / 2, v + wdt / 2, barY0 - len, barY0, 'ink'));
      k += 1;
    }
    if (minorMm) {
      for (let v = -half + minorMm; v < half - 1e-9; v += majorMm) {
        elements.push(sheetRect(`${id}-tick-${k}`, v - RULE_MM / 2, v + RULE_MM / 2, barY0 - 1.6, barY0, 'ink'));
        k += 1;
      }
    }
    // Graduations are labelled every `labelEveryMm`; the outermost pair is
    // anchored inward so the numerals cannot push past the bar and into a
    // tag's quiet zone, and the last one carries the unit.
    let li = 0;
    for (let v = -half; v <= half + 1e-9; v += labelEveryMm) {
      const isFirst = li === 0;
      const isLast = Math.abs(v - half) < 1e-9;
      const str = isLast ? endLabel : String(Math.round((v + half) / unitMm));
      elements.push(text(
        `${id}-label-${li}`, v, barY0 - 7, str, 2.8,
        isFirst ? 'start' : (isLast ? 'end' : 'middle'),
      ));
      li += 1;
    }
    rulers.push({
      id,
      lengthMm: q(lengthMm),
      start: { x: q(-half), y: q((barY0 + barY1) / 2) },
      end: { x: q(half), y: q((barY0 + barY1) / 2) },
      barHeightMm: q(BAR_H_MM),
      graduationMm: q(majorMm),
      labelEveryMm: q(labelEveryMm),
    });
  };

  function text(id, sx, sy, str, sizeMm, anchor = 'middle', weight = 'normal') {
    const p = toPage(sx, sy);
    return {
      type: 'text',
      id,
      cls: 'txt',
      x: q(p.x),
      y: q(p.y),
      text: str,
      sizeMm: q(sizeMm),
      anchor,
      weight,
    };
  }

  // back band, measured down from the back edge; the first 12 mm belong to the
  // back centre tick, so the copy starts below it.
  elements.push(text('print-warning', 0, Fh - 17, "PRINT AT 100% — NEVER 'FIT TO PAGE'", 3.8, 'middle', 'bold'));
  elements.push(text('print-note-1', 0, Fh - 21.5, "Measure a bar. If it isn't exactly 100 mm / 4 in,", 2.8));
  elements.push(text('print-note-2', 0, Fh - 25, 'type what you measure into the app.', 2.8));

  addRuler('ruler-100mm', 100, Fh - 28.5, 10, 0, '100 mm', 20, 1);
  addRuler('ruler-4in', 101.6, Fh - 42, 25.4, 12.7, '4 in', 25.4, 25.4);

  // write-in box
  const boxHalf = 30;
  const boxTop = Fh - 58.5;
  const boxBot = Fh - 65.5;
  elements.push(text('write-in-label', 0, boxTop + 1.5, 'write your measured length here', 2.8));
  elements.push(sheetRect('write-in-box-top', -boxHalf, boxHalf, boxTop - RULE_MM, boxTop, 'ink'));
  elements.push(sheetRect('write-in-box-bottom', -boxHalf, boxHalf, boxBot, boxBot + RULE_MM, 'ink'));
  elements.push(sheetRect('write-in-box-left', -boxHalf, -boxHalf + RULE_MM, boxBot, boxTop, 'ink'));
  elements.push(sheetRect('write-in-box-right', boxHalf - RULE_MM, boxHalf, boxBot, boxTop, 'ink'));

  manifest.rulers = rulers;
  manifest.writeInBox = {
    xMinMm: q(-boxHalf), xMaxMm: q(boxHalf), yMinMm: q(boxBot), yMaxMm: q(boxTop),
  };

  // --- labels near the datum, reading top-to-bottom toward the line --------
  elements.push(text('datum-label', 0, 32, 'SEAT FRONT', 5, 'middle', 'bold'));
  elements.push(text('datum-sublabel', 0, 26.5, 'this line goes under the front edge of the seat', 3.2));
  elements.push(text('center-label', 0, 21, 'CENTER — align with the chair centerline', 3.2));

  // --- micro-instructions (35 words) --------------------------------------
  elements.push(text('instr-1', 0, midY + 6,
    'FLOOR — slide the sheet under the chair: SEAT FRONT line plumb below the', 3.6));
  elements.push(text('instr-2', 0, midY + 1,
    "seat's front edge, CENTER ticks on the chair centerline.", 3.6));
  elements.push(text('instr-3', 0, midY - 4,
    'SEAT — for the top-down photo, move the sheet onto the seat, same alignment.', 3.6));

  // --- footer --------------------------------------------------------------
  elements.push(text('variant-label', 0, midY - 12, `chairagram marker sheet · ${V.label} · tag36h11 ids ${V.tagIds.join(' ')} · 60 mm tags`, 2.6));

  const sheet = {
    variant: V.name,
    paper: { widthMm: W, heightMm: H },
    elements,
    manifest,
  };
  sheet.svg = buildSvg(sheet);
  return sheet;
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

/**
 * Merge the black modules of a tag bitmap into as few rectangles as possible
 * (horizontal runs, then vertically where consecutive rows share a run) and
 * emit them as one path. Fewer, larger rects print without seam artefacts and
 * keep the file small; the merge is deterministic.
 */
function tagPathData(cells, modules, x0, y0, size) {
  const m = size / modules;
  const used = new Uint8Array(modules * modules);
  const parts = [];
  for (let r = 0; r < modules; r += 1) {
    for (let c = 0; c < modules; c += 1) {
      if (cells[r * modules + c] || used[r * modules + c]) continue;
      let c1 = c;
      while (c1 + 1 < modules && !cells[r * modules + c1 + 1] && !used[r * modules + c1 + 1]) c1 += 1;
      let r1 = r;
      // extend down while the identical run is free
      for (;;) {
        const rn = r1 + 1;
        if (rn >= modules) break;
        let ok = true;
        for (let k = c; k <= c1; k += 1) {
          if (cells[rn * modules + k] || used[rn * modules + k]) { ok = false; break; }
        }
        if (!ok) break;
        r1 = rn;
      }
      for (let rr = r; rr <= r1; rr += 1) for (let cc = c; cc <= c1; cc += 1) used[rr * modules + cc] = 1;
      const px = x0 + c * m;
      const py = y0 + r * m;
      const pw = (c1 - c + 1) * m;
      const ph = (r1 - r + 1) * m;
      parts.push(`M${n(px)} ${n(py)}h${n(pw)}v${n(ph)}h${n(-pw)}Z`);
    }
  }
  return parts.join('');
}

function buildSvg(sheet) {
  const { widthMm: W, heightMm: H } = sheet.paper;
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${n(W)}mm" height="${n(H)}mm" `
    + `viewBox="0 0 ${n(W)} ${n(H)}" data-variant="${sheet.variant}">`,
  );
  out.push(`  <title>chairagram marker sheet — ${esc(sheet.manifest.label)}</title>`);
  out.push('  <desc>Print at 100%. Geometry of record is marker-manifest.json.</desc>');
  out.push('  <style>');
  out.push('    .ink { fill: #000000; }');
  out.push('    .txt { fill: #000000; font-family: Helvetica, Arial, sans-serif; }');
  out.push('  </style>');
  out.push(`  <rect id="paper" x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#ffffff"/>`);

  for (const el of sheet.elements) {
    switch (el.type) {
      case 'rect':
        out.push(`  <rect id="${el.id}" class="${el.cls}" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}"/>`);
        break;
      case 'polygon':
        out.push(`  <polygon id="${el.id}" class="${el.cls}" points="${el.points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}"/>`);
        break;
      case 'tag':
        out.push(`  <g id="${el.id}" data-tag-id="${el.tagId}" data-role="${el.role}" data-x="${n(el.x)}" data-y="${n(el.y)}" data-size="${n(el.size)}">`);
        out.push(`    <rect id="${el.id}-quiet" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.size)}" height="${n(el.size)}" fill="#ffffff"/>`);
        out.push(`    <path id="${el.id}-bits" class="ink" d="${tagPathData(el.cells, el.modules, el.x, el.y, el.size)}"/>`);
        out.push('  </g>');
        break;
      case 'text':
        out.push(
          `  <text id="${el.id}" class="txt" x="${n(el.x)}" y="${n(el.y)}" font-size="${n(el.sizeMm)}" `
          + `text-anchor="${el.anchor}" font-weight="${el.weight}">${esc(el.text)}</text>`,
        );
        break;
      default:
        throw new Error(`sheet: unknown element type "${el.type}"`);
    }
  }
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

/** Manifest as the exact bytes generate.mjs writes. */
export function manifestJson(sheet) {
  return `${JSON.stringify(sheet.manifest, null, 2)}\n`;
}
