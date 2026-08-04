// detect.js — thin wrapper around the vendored AprilTag WASM detector.
//
//   grayscale Uint8Array + width/height  ->  [{ id, corners: [{x,y} x4], center }]
//
// No image codecs, no CDN, no Comlink. Upstream ships html/apriltag.js as a
// web-worker class that `importScripts()` a CDN copy of Comlink; that is
// unusable here (offline, node), so this file talks to the emscripten glue
// (vendor/apriltag/apriltag_wasm.js) directly through the same cwrap()
// entry points upstream uses. The C API is documented in
// vendor/apriltag/PROVENANCE.md.
//
// Works in node (>= 18) and in a browser from the same source: the node
// branch evaluates the CommonJS-shaped emscripten glue with a synthesised
// module/require/__dirname, the browser branch expects (or injects) the
// glue's <script> global.

/**
 * Half-pixel offset added to every detected coordinate, to put detections in
 * the same continuous frame raster.js and warp.js use (pixel i spans [i, i+1),
 * centre at i + 0.5).
 *
 * It is ZERO, and that is a measured result, not an assumption. AprilTag's
 * line fitter already does the conversion: compute_lfps() in
 * apriltag_quad_thresh.c stores edge points in half-pixel fixed point and then
 * converts with
 *
 *     double delta = 0.5;         // adjust for pixel center bias
 *     double x = p->x * .5 + delta;
 *
 * so a black/white transition between pixel index i and i+1 comes out at i+1 —
 * exactly where the continuous frame puts that pixel boundary. Setting this to
 * 0.5 (the naive "index -> centre" correction) instead adds a measured +0.4 px
 * translation bias to every corner. test.mjs pins the residual: the "corner
 * convention" check rasterises tags at exactly-known positions and asserts the
 * bias stays under a tenth of a pixel.
 */
export const CORNER_ORIGIN_SHIFT = 0;

const DEFAULT_OPTIONS = {
  // 1.0, not upstream's 2.0: decimation halves the resolution the quad finder
  // sees and costs roughly a quarter pixel of corner accuracy, which is most
  // of the sub-pixel budget the acceptance suite spends.
  quadDecimate: 1.0,
  quadSigma: 0.0,
  nthreads: 1,
  refineEdges: 1,
  maxDetections: 0, // 0 = return all
  // Pose needs camera intrinsics we do not have here, and the C code prints
  // to stdout when it is on. The sheet's pose comes from the manifest
  // homography, not from the detector.
  returnPose: 0,
  returnSolutions: 0,
};

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

let modulePromise = null;

async function loadWasmModule() {
  if (modulePromise) return modulePromise;
  modulePromise = isNode ? loadUnderNode() : loadInBrowser();
  return modulePromise;
}

async function loadUnderNode() {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const { createRequire } = await import('node:module');

  const here = dirname(fileURLToPath(import.meta.url));
  const vendorDir = join(here, 'vendor', 'apriltag');
  const gluePath = join(vendorDir, 'apriltag_wasm.js');
  const src = await readFile(gluePath, 'utf8');

  // The glue is emscripten MODULARIZE output wrapped in a UMD tail. Evaluate
  // it as CommonJS with the identifiers it expects; nothing is patched.
  const shim = { exports: {} };
  const requireFn = createRequire(gluePath);
  // eslint-disable-next-line no-new-func
  const run = new Function('module', 'exports', 'require', '__dirname', '__filename', src);
  run(shim, shim.exports, requireFn, vendorDir, gluePath);

  const factory = shim.exports;
  if (typeof factory !== 'function') {
    throw new Error('detect: vendored apriltag_wasm.js did not export the AprilTagWasm factory');
  }
  // Hand the module the .wasm bytes outright. The glue predates node's global
  // fetch(): its instantiateAsync() sees `typeof fetch === "function"`, decides
  // it is in a browser, and tries to fetch an absolute filesystem path. Setting
  // wasmBinary short-circuits that whole branch.
  const wasmBinary = await readFile(join(vendorDir, 'apriltag_wasm.wasm'));
  return factory({
    wasmBinary: new Uint8Array(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength),
    locateFile: (p) => join(vendorDir, p),
  });
}

async function loadInBrowser() {
  if (typeof globalThis.AprilTagWasm !== 'function') {
    const url = new URL('./vendor/apriltag/apriltag_wasm.js', import.meta.url).href;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = res;
      s.onerror = () => rej(new Error(`detect: could not load ${url}`));
      document.head.appendChild(s);
    });
  }
  const base = new URL('./vendor/apriltag/', import.meta.url).href;
  return globalThis.AprilTagWasm({ locateFile: (p) => base + p });
}

/**
 * Create a detector. One instance per process is enough — the underlying C
 * detector is a single global, so calls must not interleave.
 *
 * @param {object} [options] see DEFAULT_OPTIONS
 * @returns {Promise<{detect:Function,setOptions:Function,options:object,destroy:Function}>}
 */
export async function createDetector(options = {}) {
  const Module = await loadWasmModule();
  const opt = { ...DEFAULT_OPTIONS, ...options };

  const c = {
    init: Module.cwrap('atagjs_init', 'number', []),
    destroy: Module.cwrap('atagjs_destroy', 'number', []),
    setDetectorOptions: Module.cwrap('atagjs_set_detector_options', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number']),
    setImgBuffer: Module.cwrap('atagjs_set_img_buffer', 'number', ['number', 'number', 'number']),
    detect: Module.cwrap('atagjs_detect', 'number', []),
  };

  c.init();
  const pushOptions = () => c.setDetectorOptions(
    opt.quadDecimate, opt.quadSigma, opt.nthreads, opt.refineEdges,
    opt.maxDetections, opt.returnPose, opt.returnSolutions,
  );
  pushOptions();

  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  return {
    options: opt,

    setOptions(next) {
      Object.assign(opt, next);
      pushOptions();
      return { ...opt };
    },

    /**
     * @param {Uint8Array} gray row-major grayscale, length >= width*height
     * @param {number} width
     * @param {number} height
     * @returns {Array<{id:number,corners:Array<{x:number,y:number}>,center:{x:number,y:number}}>}
     */
    detect(gray, width, height) {
      if (!(gray instanceof Uint8Array)) throw new Error('detect: expected a Uint8Array of grayscale bytes');
      if (gray.length < width * height) {
        throw new Error(`detect: buffer has ${gray.length} bytes, need ${width * height}`);
      }
      const buf = c.setImgBuffer(width, height, width);
      Module.HEAPU8.set(gray.subarray(0, width * height), buf);
      const ptr = c.detect();
      const len = Module.getValue(ptr, 'i32');
      if (len === 0) return [];
      const strPtr = Module.getValue(ptr + 4, 'i32');
      const bytes = Module.HEAPU8.subarray(strPtr, strPtr + len);
      const json = decoder ? decoder.decode(bytes) : Array.from(bytes, (b) => String.fromCharCode(b)).join('');
      const raw = JSON.parse(json);
      if (!Array.isArray(raw)) throw new Error(`detect: detector returned ${json}`);
      const s = CORNER_ORIGIN_SHIFT;
      return raw.map((d) => ({
        id: d.id,
        corners: d.corners.map((p) => ({ x: p.x + s, y: p.y + s })),
        center: { x: d.center.x + s, y: d.center.y + s },
      }));
    },

    destroy() {
      c.destroy();
    },
  };
}
