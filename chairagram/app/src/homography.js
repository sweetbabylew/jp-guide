// homography.js — 4-point DLT, apply/invert, paper rectification.
//
// PURE MATH. No DOM, no Date, no random. Imported by node tests.
//
// Points are {x, y} in whatever pixel space the caller is using. A homography
// is a flat 9-element array in row-major order:
//
//     [ h0 h1 h2 ]
//     [ h3 h4 h5 ]   maps (x, y) -> ( (h0x+h1y+h2)/w, (h3x+h4y+h5)/w )
//     [ h6 h7 h8 ]                   with w = h6x + h7y + h8
//
// Hartley normalisation is applied before the DLT solve: the raw pixel
// coordinates of a phone photo are ~1e3, so the un-normalised system is
// ~1e12 in condition number and loses the sub-pixel accuracy the annotator
// depends on. Normalising costs 25 lines and buys ~6 digits.

/** Solve a small dense square system A x = b (Gauss, partial pivoting). */
export function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (!(Math.abs(M[piv][col]) > 1e-12)) {
      throw new Error('homography: degenerate point set (are three points collinear?)');
    }
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    const d = M[col][col];
    for (let c = col; c <= n; c += 1) M[col][c] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** 3x3 * 3x3, both row-major flat arrays of 9. */
export function multiply(A, B) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      let s = 0;
      for (let k = 0; k < 3; k += 1) s += A[r * 3 + k] * B[k * 3 + c];
      out[r * 3 + c] = s;
    }
  }
  return out;
}

/** Inverse of a 3x3, normalised so H[8] === 1 when that is possible. */
export function invert(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) {
    throw new Error('homography: matrix is singular, cannot invert');
  }
  const inv = [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
  return normalise(inv);
}

/** Scale a homography so its bottom-right entry is 1 (harmless, tidier). */
export function normalise(H) {
  const k = H[8];
  if (!Number.isFinite(k) || k === 0) return H.slice();
  return H.map((v) => v / k);
}

/** Map one point through a homography. */
export function apply(H, p) {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (!Number.isFinite(w) || w === 0) {
    throw new Error('homography: point maps to the horizon (w = 0)');
  }
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** Hartley normalisation: centroid to origin, mean distance sqrt(2). */
function normalisingTransform(pts) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length;
  cy /= pts.length;
  let mean = 0;
  for (const p of pts) mean += Math.hypot(p.x - cx, p.y - cy);
  mean /= pts.length;
  const s = mean > 1e-12 ? Math.SQRT2 / mean : 1;
  return {
    T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
    map: (p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }),
  };
}

/**
 * homographyFromPoints(src[4], dst[4]) -> H mapping src -> dst.
 * Throws a readable Error when the quad is degenerate.
 */
export function homographyFromPoints(src, dst) {
  if (!Array.isArray(src) || !Array.isArray(dst) || src.length !== 4 || dst.length !== 4) {
    throw new Error('homography: needs exactly 4 source and 4 destination points');
  }
  for (const p of [...src, ...dst]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error('homography: every point needs finite x and y');
    }
  }
  const ns = normalisingTransform(src);
  const nd = normalisingTransform(dst);
  const S = src.map(ns.map);
  const D = dst.map(nd.map);

  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = S[i];
    const { x: u, y: v } = D[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solveDense(A, b);
  const Hn = [...h, 1];
  // H = inv(Tdst) * Hn * Tsrc
  return normalise(multiply(invert(nd.T), multiply(Hn, ns.T)));
}

// ---------------------------------------------------------------------------
// Paper rectification (top view)
// ---------------------------------------------------------------------------

export const MM_PER_IN = 25.4;

/** Convert a length between 'in' and 'mm'. */
export function convertLength(value, from, to) {
  if (from === to) return value;
  return from === 'in' ? value * MM_PER_IN : value / MM_PER_IN;
}

/** Known calibration sheets. Native units are how the size is actually defined. */
export const PAPERS = {
  letter: { label: 'US Letter', short: 8.5, long: 11, native: 'in' },
  a4: { label: 'A4', short: 210, long: 297, native: 'mm' },
};

/** Paper short/long side expressed in the project's units. */
export function paperDims(kind, units) {
  const p = PAPERS[kind];
  if (!p) throw new Error(`homography: unknown paper "${kind}"`);
  return {
    short: convertLength(p.short, p.native, units),
    long: convertLength(p.long, p.native, units),
  };
}

/**
 * Decide which clicked edge pair is the paper's LONG side.
 * corners are clicked in ring order (any starting corner, either winding);
 * the p0->p1 / p2->p3 pair is "edge A", p1->p2 / p3->p0 is "edge B".
 * Returns true when edge A is the long side.
 */
export function edgeALonger(corners) {
  const len = (i, j) => Math.hypot(corners[j].x - corners[i].x, corners[j].y - corners[i].y);
  const a = (len(0, 1) + len(2, 3)) / 2;
  const b = (len(1, 2) + len(3, 0)) / 2;
  return a >= b;
}

/**
 * rectifyPlan(corners, { paper, units, pxPerUnit, swap })
 *
 * corners: the 4 clicked paper corners in the ORIGINAL image, ring order.
 * Returns the transform that takes original-image pixels to rectified pixels,
 * plus the rectified canvas size. `pxPerUnit` is rectified pixels per project
 * unit — the number the solver divides by to read plan measurements.
 */
export function rectifyPlan(corners, { paper = 'letter', units = 'in', pxPerUnit = 48, swap = false } = {}) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    throw new Error('homography: the top view needs all 4 paper corners');
  }
  const dims = paperDims(paper, units);
  let aIsLong = edgeALonger(corners);
  if (swap) aIsLong = !aIsLong;
  const wUnits = aIsLong ? dims.long : dims.short;
  const hUnits = aIsLong ? dims.short : dims.long;
  const W = wUnits * pxPerUnit;
  const H = hUnits * pxPerUnit;
  const dst = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const Hm = homographyFromPoints(corners, dst);
  return {
    H: Hm,
    Hinv: invert(Hm),
    widthPx: W,
    heightPx: H,
    widthUnits: wUnits,
    heightUnits: hUnits,
    pxPerUnit,
    units,
    paper,
  };
}
