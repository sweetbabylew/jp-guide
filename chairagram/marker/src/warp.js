// warp.js — synthetic capture: homographies, bilinear resampling, blur, noise.
//
// PURE. No DOM, no fs, no Date, and no Math.random — the noise generator is a
// seeded mulberry32 so every run of the harness produces identical bytes.
//
// Continuous-coordinate convention (shared with raster.js and detect.js):
// pixel index i spans [i, i+1) and its centre sits at i + 0.5.
//
// A homography is a flat 9-element row-major array:
//     [ h0 h1 h2 ]
//     [ h3 h4 h5 ]  maps (x, y) -> ((h0x+h1y+h2)/w, (h3x+h4y+h5)/w)
//     [ h6 h7 h8 ]  with w = h6x + h7y + h8

// ---------------------------------------------------------------------------
// linear algebra
// ---------------------------------------------------------------------------

/** Gaussian elimination with partial pivoting. */
export function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (!(Math.abs(M[piv][col]) > 1e-12)) throw new Error('warp: singular system');
    const t = M[col]; M[col] = M[piv]; M[piv] = t;
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

export function matMul3(A, B) {
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

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function invertH(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) throw new Error('warp: non-invertible homography');
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((v) => v / det);
  return inv;
}

/**
 * 4-point DLT with Hartley normalisation.
 *
 * Normalisation is not optional here: raw coordinates in a 3000 px raster make
 * the un-normalised system ~1e12 in condition number, which eats the sub-pixel
 * accuracy this whole phase is about.
 */
export function homographyFromPoints(src, dst) {
  if (src.length < 4 || dst.length !== src.length) throw new Error('warp: need >= 4 matched points');
  const norm = (pts) => {
    let cx = 0; let cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let d = 0;
    for (const p of pts) d += Math.hypot(p.x - cx, p.y - cy);
    d /= pts.length;
    const s = d > 1e-12 ? Math.SQRT2 / d : 1;
    return { T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1], pts: pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })) };
  };
  const ns = norm(src);
  const nd = norm(dst);
  const A = [];
  const bvec = [];
  for (let i = 0; i < ns.pts.length; i += 1) {
    const { x, y } = ns.pts[i];
    const { x: X, y: Y } = nd.pts[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    bvec.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    bvec.push(Y);
  }
  let h;
  if (A.length === 8) {
    h = solveDense(A, bvec);
  } else {
    // least squares via normal equations for the over-determined case
    const N = Array.from({ length: 8 }, () => new Array(8).fill(0));
    const rhs = new Array(8).fill(0);
    for (let r = 0; r < A.length; r += 1) {
      for (let i = 0; i < 8; i += 1) {
        rhs[i] += A[r][i] * bvec[r];
        for (let j = 0; j < 8; j += 1) N[i][j] += A[r][i] * A[r][j];
      }
    }
    h = solveDense(N, rhs);
  }
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  return matMul3(invertH(nd.T), matMul3(Hn, ns.T));
}

// ---------------------------------------------------------------------------
// a camera looking at the sheet
// ---------------------------------------------------------------------------

const deg = (d) => (d * Math.PI) / 180;

function rotX(t) {
  const c = Math.cos(t); const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function rotZ(t) {
  const c = Math.cos(t); const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
function transpose3(M) {
  return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
}
function mulVec3(M, v) {
  return [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
}

/**
 * Homography from SHEET mm to image px for a pinhole camera aimed at the sheet.
 *
 * World frame == sheet frame with Z out of the paper. The rig starts in front
 * of the sheet (-Y) looking straight at it, then is lifted by `elevationDeg`
 * about the world X axis, swung by `azimuthDeg` about world Z, and finally
 * rolled about its own optical axis by `rollDeg`.
 *
 *   elevationDeg   0 = camera in the sheet's own plane (useless),
 *                  20 = a floor sheet seen from an elevation shot,
 *                  90 = straight down (top view). "±25° off plumb" for the
 *                  seat placement is elevation 65..90 combined with azimuth.
 *
 * The focal length is solved so that the MEAN projected tag bitmap edge comes
 * out at `targetTagPx`, and the principal point / image size are chosen to fit
 * the printed frame with `padPx` of paper around it.
 *
 * @returns {{H:number[], width:number, height:number, focalPx:number,
 *            tagPx:{mean:number,min:number,max:number}, maxScalePxPerMm:number}}
 */
export function sheetCamera(manifest, {
  elevationDeg = 90,
  azimuthDeg = 0,
  rollDeg = 0,
  distanceMm = 2500,
  targetTagPx = 200,
  padPx = 24,
} = {}) {
  const e = deg(elevationDeg);
  const a = deg(azimuthDeg);
  const roll = deg(rollDeg);

  const target = [0, manifest.frame.yMaxMm / 2, 0];
  const M = matMul3(rotZ(a), rotX(-e));       // rig rotation in world
  const C = mulVec3(M, [0, -distanceMm, 0]).map((v, i) => v + target[i]);

  // base world->cam: x_cam = X, y_cam = -Z, z_cam = Y
  const Rbase = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const Rroll = [Math.cos(roll), -Math.sin(roll), 0, Math.sin(roll), Math.cos(roll), 0, 0, 0, 1];
  const R = matMul3(Rroll, matMul3(Rbase, transpose3(M)));

  const t = mulVec3(R, C);
  // columns of R for world X and Y, and the translation
  const Hcam = [
    R[0], R[1], -t[0],
    R[3], R[4], -t[1],
    R[6], R[7], -t[2],
  ];

  const tagEdge = (H) => manifest.tags.map((tag) => {
    const c = tag.corners.map((p) => applyH(H, p.x, p.y));
    let s = 0;
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      s += Math.hypot(c[j].x - c[i].x, c[j].y - c[i].y);
    }
    return s / 4;
  });

  const unit = tagEdge(Hcam);
  const meanUnit = unit.reduce((s, v) => s + v, 0) / unit.length;
  if (!(meanUnit > 0)) throw new Error('warp: degenerate camera (tag projects to nothing)');
  const f = targetTagPx / meanUnit;

  const K0 = [f, 0, 0, 0, f, 0, 0, 0, 1];
  const H0 = matMul3(K0, Hcam);

  // fit the printed frame (plus quiet paper) into the image
  const fr = manifest.frame;
  const box = [
    { x: fr.xMinMm, y: fr.yMinMm }, { x: fr.xMaxMm, y: fr.yMinMm },
    { x: fr.xMaxMm, y: fr.yMaxMm }, { x: fr.xMinMm, y: fr.yMaxMm },
  ].map((p) => applyH(H0, p.x, p.y));
  const xs = box.map((p) => p.x);
  const ys = box.map((p) => p.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const cx = padPx - minX;
  const cy = padPx - minY;
  const K = [f, 0, cx, 0, f, cy, 0, 0, 1];
  const H = matMul3(K, Hcam);
  const width = Math.ceil(maxX - minX + 2 * padPx);
  const height = Math.ceil(maxY - minY + 2 * padPx);

  const edges = tagEdge(H);
  const tagPx = {
    mean: edges.reduce((s, v) => s + v, 0) / edges.length,
    min: Math.min(...edges),
    max: Math.max(...edges),
  };
  return {
    H, width, height, focalPx: f, tagPx,
    maxScalePxPerMm: tagPx.max / manifest.tag.sizeMm,
    camera: { elevationDeg, azimuthDeg, rollDeg, distanceMm },
  };
}

// ---------------------------------------------------------------------------
// resampling
// ---------------------------------------------------------------------------

/** Bilinear sample in continuous coordinates; returns `bg` outside the image. */
export function sampleBilinear(img, x, y, bg = 255) {
  const { width, height, data } = img;
  const fx = x - 0.5;
  const fy = y - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const px = (i, j) => {
    if (i < 0 || j < 0 || i >= width || j >= height) return bg;
    return data[j * width + i];
  };
  const a = px(i0, j0) * (1 - tx) + px(i0 + 1, j0) * tx;
  const b = px(i0, j0 + 1) * (1 - tx) + px(i0 + 1, j0 + 1) * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * Warp `src` through `H` (src px -> dst px) into a new image.
 *
 * `samples` is the per-axis supersampling factor. Perspective compresses the
 * far side of an oblique sheet, so a single bilinear tap there aliases the tag
 * modules into mush; averaging an NxN grid of taps is a cheap stand-in for a
 * real camera's area integration.
 */
export function warpImage(src, H, { width, height, samples = 4, background = 255 }) {
  const Hi = invertH(H);
  const out = new Uint8Array(width * height);
  const s = Math.max(1, Math.floor(samples));
  const inv = 1 / (s * s);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let acc = 0;
      for (let sy = 0; sy < s; sy += 1) {
        const y = j + (sy + 0.5) / s;
        for (let sx = 0; sx < s; sx += 1) {
          const x = i + (sx + 0.5) / s;
          const w = Hi[6] * x + Hi[7] * y + Hi[8];
          acc += sampleBilinear(
            src,
            (Hi[0] * x + Hi[1] * y + Hi[2]) / w,
            (Hi[3] * x + Hi[4] * y + Hi[5]) / w,
            background,
          );
        }
      }
      out[j * width + i] = Math.max(0, Math.min(255, Math.round(acc * inv)));
    }
  }
  return { width, height, data: out };
}

/** Rotate by a multiple of 90 degrees. Exact — no resampling. */
export function rotate90(img, times) {
  const k = ((times % 4) + 4) % 4;
  if (k === 0) return { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const { width: w, height: h, data } = img;
  const nw = k === 2 ? w : h;
  const nh = k === 2 ? h : w;
  const out = new Uint8Array(nw * nh);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const v = data[j * w + i];
      let ni; let nj;
      if (k === 1) { ni = h - 1 - j; nj = i; }        // clockwise
      else if (k === 2) { ni = w - 1 - i; nj = h - 1 - j; }
      else { ni = j; nj = w - 1 - i; }                 // counter-clockwise
      out[nj * nw + ni] = v;
    }
  }
  return { width: nw, height: nh, data: out };
}

/** The homography that rotate90() applies, so ground truth can follow along. */
export function rotate90Homography(img, times) {
  const k = ((times % 4) + 4) % 4;
  const { width: w, height: h } = img;
  // continuous-coordinate maps matching rotate90()'s index maps
  if (k === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (k === 1) return [0, -1, h, 1, 0, 0, 0, 0, 1];
  if (k === 2) return [-1, 0, w, 0, -1, h, 0, 0, 1];
  return [0, 1, 0, -1, 0, w, 0, 0, 1];
}

// ---------------------------------------------------------------------------
// degradation
// ---------------------------------------------------------------------------

/** Separable Gaussian blur, radius ceil(3 sigma). */
export function blurImage(img, sigmaPx) {
  if (!(sigmaPx > 0)) return { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const r = Math.max(1, Math.ceil(3 * sigmaPx));
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigmaPx * sigmaPx));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i += 1) k[i] /= sum;

  const { width, height, data } = img;
  const tmp = new Float64Array(width * height);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let acc = 0;
      for (let t = -r; t <= r; t += 1) {
        const ii = Math.min(width - 1, Math.max(0, i + t));
        acc += data[j * width + ii] * k[t + r];
      }
      tmp[j * width + i] = acc;
    }
  }
  const out = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let acc = 0;
      for (let t = -r; t <= r; t += 1) {
        const jj = Math.min(height - 1, Math.max(0, j + t));
        acc += tmp[jj * width + i] * k[t + r];
      }
      out[j * width + i] = Math.max(0, Math.min(255, Math.round(acc)));
    }
  }
  return { width, height, data: out };
}

/** mulberry32 — 32-bit seeded PRNG. Deterministic across engines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Additive Gaussian noise (Box-Muller on a seeded PRNG). */
export function addNoise(img, sigma, seed = 1) {
  if (!(sigma > 0)) return { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const rnd = mulberry32(seed);
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 2) {
    const u1 = Math.max(1e-12, rnd());
    const u2 = rnd();
    const r = Math.sqrt(-2 * Math.log(u1)) * sigma;
    const z0 = r * Math.cos(2 * Math.PI * u2);
    const z1 = r * Math.sin(2 * Math.PI * u2);
    out[i] = Math.max(0, Math.min(255, Math.round(data[i] + z0)));
    if (i + 1 < data.length) out[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] + z1)));
  }
  return { width, height, data: out };
}
