// raster.js — sheet geometry -> grayscale Uint8Array. No image codecs, ever.
//
// PURE. No DOM, no fs, no Date, no random.
//
// Everything the marker sheet prints is black ink on white paper, so the
// rasteriser accumulates a single float "ink coverage" buffer and converts it
// to gray at the end:
//
//     gray = round(255 * (1 - clamp(ink, 0, 1)))
//
// Accumulating coverage (rather than alpha-compositing shape by shape) is what
// keeps abutting shapes seamless: two rects that share an edge and split a
// pixel 40/60 give ink = 1.0 and a solid black pixel, where compositing would
// leave a 0.4*0.6 = 24% light seam. That matters both for the eyeball PGM and
// for the detector, which is sensitive to bright lines inside a black border.
//
// Coordinate convention (shared with warp.js, detect.js and the manifest
// consumers): continuous image coordinates where pixel index i spans
// [i, i+1) and its centre sits at i + 0.5. Sub-pixel corner errors are
// measured in this frame.
//
// Text is deliberately not rasterised. The detector ignores it, and drawing
// glyphs without a font engine would be a lie about what gets printed. The
// sheet keeps every text element at least one quiet zone away from any tag.

/** A fresh ink accumulator. */
export function createInk(width, height) {
  return { width, height, ink: new Float64Array(width * height) };
}

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * Add an axis-aligned rectangle with exact area coverage.
 * @param {{width:number,height:number,ink:Float64Array}} img
 */
export function addRect(img, x, y, w, h) {
  if (!(w > 0) || !(h > 0)) return;
  const { width, height, ink } = img;
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;
  const iMin = Math.max(0, Math.floor(x0));
  const iMax = Math.min(width - 1, Math.ceil(x1) - 1);
  const jMin = Math.max(0, Math.floor(y0));
  const jMax = Math.min(height - 1, Math.ceil(y1) - 1);
  for (let j = jMin; j <= jMax; j += 1) {
    const cy = Math.min(y1, j + 1) - Math.max(y0, j);
    if (cy <= 0) continue;
    const row = j * width;
    for (let i = iMin; i <= iMax; i += 1) {
      const cx = Math.min(x1, i + 1) - Math.max(x0, i);
      if (cx <= 0) continue;
      ink[row + i] += cx * cy;
    }
  }
}

/**
 * Add a filled polygon by NxN supersampling (used only for the arrowhead —
 * every other element on the sheet is an axis-aligned rect).
 * @param {Array<{x:number,y:number}>} pts
 */
export function addPolygon(img, pts, samplesPerAxis = 4) {
  const { width, height, ink } = img;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const iMin = Math.max(0, Math.floor(minX));
  const iMax = Math.min(width - 1, Math.ceil(maxX));
  const jMin = Math.max(0, Math.floor(minY));
  const jMax = Math.min(height - 1, Math.ceil(maxY));
  const n = samplesPerAxis;
  const wgt = 1 / (n * n);
  for (let j = jMin; j <= jMax; j += 1) {
    for (let i = iMin; i <= iMax; i += 1) {
      let hits = 0;
      for (let sy = 0; sy < n; sy += 1) {
        const py = j + (sy + 0.5) / n;
        for (let sx = 0; sx < n; sx += 1) {
          const px = i + (sx + 0.5) / n;
          if (pointInPolygon(px, py, pts)) hits += 1;
        }
      }
      if (hits) ink[j * width + i] += hits * wgt;
    }
  }
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a, a += 1) {
    const pa = pts[a];
    const pb = pts[b];
    if ((pa.y > py) !== (pb.y > py)) {
      const t = (py - pa.y) / (pb.y - pa.y);
      if (px < pa.x + t * (pb.x - pa.x)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Add an n x n module grid (a tag bitmap) with exact box-filter coverage.
 *
 * `cells` is row-major, 1 = white (no ink), 0 = black (full ink). The whole
 * grid is integrated in one pass so module edges inside the tag never leave
 * seams, and a pixel that straddles the border of a black module gets exactly
 * the area-weighted average an ideal print+capture would give.
 */
export function addModuleGrid(img, x, y, size, cells, n) {
  const { width, height, ink } = img;
  const m = size / n; // module size in px
  const iMin = Math.max(0, Math.floor(x));
  const iMax = Math.min(width - 1, Math.ceil(x + size) - 1);
  const jMin = Math.max(0, Math.floor(y));
  const jMax = Math.min(height - 1, Math.ceil(y + size) - 1);
  for (let j = jMin; j <= jMax; j += 1) {
    const py0 = j;
    const py1 = j + 1;
    const rMin = clamp(Math.floor((py0 - y) / m), 0, n - 1);
    const rMax = clamp(Math.ceil((py1 - y) / m) - 1, 0, n - 1);
    for (let i = iMin; i <= iMax; i += 1) {
      const px0 = i;
      const px1 = i + 1;
      const cMin = clamp(Math.floor((px0 - x) / m), 0, n - 1);
      const cMax = clamp(Math.ceil((px1 - x) / m) - 1, 0, n - 1);
      let acc = 0;
      for (let r = rMin; r <= rMax; r += 1) {
        const my0 = y + r * m;
        const oy = Math.min(py1, my0 + m) - Math.max(py0, my0);
        if (oy <= 0) continue;
        const row = r * n;
        for (let c = cMin; c <= cMax; c += 1) {
          if (cells[row + c]) continue; // white module: no ink
          const mx0 = x + c * m;
          const ox = Math.min(px1, mx0 + m) - Math.max(px0, mx0);
          if (ox <= 0) continue;
          acc += ox * oy;
        }
      }
      if (acc) ink[j * width + i] += acc;
    }
  }
}

/** Ink accumulator -> 8-bit grayscale (255 = paper white, 0 = ink black). */
export function toGray(img) {
  const { width, height, ink } = img;
  const data = new Uint8Array(width * height);
  for (let k = 0; k < data.length; k += 1) {
    data[k] = Math.round(255 * (1 - clamp(ink[k], 0, 1)));
  }
  return { width, height, data };
}

/**
 * Rasterise a sheet (from sheet.js) at a given resolution.
 *
 * @param {object} sheet result of buildSheet()
 * @param {object} opts
 * @param {number} [opts.dpi=300]        dots per inch
 * @param {number} [opts.pxPerMm]        overrides dpi if given
 * @param {number} [opts.padMm=0]        extra white paper around the page
 * @returns {{width:number,height:number,data:Uint8Array,pxPerMm:number,dpi:number,
 *            originPx:{x:number,y:number},sheetToPx:Function,pxToSheet:Function,
 *            tagPx:number}}
 */
export function rasterizeSheet(sheet, opts = {}) {
  const pxPerMm = opts.pxPerMm !== undefined ? opts.pxPerMm : (opts.dpi === undefined ? 300 : opts.dpi) / 25.4;
  const dpi = pxPerMm * 25.4;
  const padMm = opts.padMm || 0;
  const width = Math.max(1, Math.round((sheet.paper.widthMm + 2 * padMm) * pxPerMm));
  const height = Math.max(1, Math.round((sheet.paper.heightMm + 2 * padMm) * pxPerMm));
  const img = createInk(width, height);
  const X = (mm) => (mm + padMm) * pxPerMm;
  const Y = (mm) => (mm + padMm) * pxPerMm;

  for (const el of sheet.elements) {
    switch (el.type) {
      case 'rect':
        addRect(img, X(el.x), Y(el.y), el.w * pxPerMm, el.h * pxPerMm);
        break;
      case 'polygon':
        addPolygon(img, el.points.map((p) => ({ x: X(p.x), y: Y(p.y) })));
        break;
      case 'tag':
        addModuleGrid(img, X(el.x), Y(el.y), el.size * pxPerMm, el.cells, el.modules);
        break;
      case 'text':
        break; // deliberately not rasterised — see file header
      default:
        throw new Error(`raster: unknown element type "${el.type}"`);
    }
  }

  const gray = toGray(img);
  const origin = sheet.manifest.pageTransform.originPageMm;
  const originPx = { x: X(origin.x), y: Y(origin.y) };
  return {
    ...gray,
    pxPerMm,
    dpi,
    padMm,
    originPx,
    tagPx: sheet.manifest.tag.sizeMm * pxPerMm,
    /** sheet mm -> continuous image px */
    sheetToPx: (sx, sy) => ({ x: originPx.x + sx * pxPerMm, y: originPx.y - sy * pxPerMm }),
    /** continuous image px -> sheet mm */
    pxToSheet: (px, py) => ({ x: (px - originPx.x) / pxPerMm, y: (originPx.y - py) / pxPerMm }),
  };
}

/**
 * Binary PGM (Netpbm P5). Not an image codec — a 15-byte header and the raw
 * bytes — so the harness can hand a human something to eyeball without
 * pulling in a PNG/JPEG encoder.
 */
export function toPGM({ width, height, data }) {
  const header = `P5\n${width} ${height}\n255\n`;
  const out = new Uint8Array(header.length + data.length);
  for (let i = 0; i < header.length; i += 1) out[i] = header.charCodeAt(i);
  out.set(data, header.length);
  return out;
}
