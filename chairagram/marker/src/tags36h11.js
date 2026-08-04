// tags36h11.js — tag36h11 bit patterns for the eight IDs the marker sheet uses.
//
// PURE DATA + PURE FUNCTIONS. No DOM, no fs, no Date, no random.
//
// ---------------------------------------------------------------------------
// Source of the numbers (transcribed, then PROVEN by round-trip detection)
// ---------------------------------------------------------------------------
// Everything below is transcribed from the AprilTag C library's generated
// dictionary and its renderer:
//
//   codes      — `static uint64_t codedata[587]` in tag36h11.c
//                https://github.com/AprilRobotics/apriltag/blob/master/tag36h11.c
//                (BSD-2-Clause, Regents of the University of Michigan).
//                Family id N is codedata[N]; we keep only 0-3 and 10-13.
//   BIT_X/BIT_Y — the `tf->bit_x[i] / tf->bit_y[i]` assignments in
//                tag36h11_create() in the same file.
//   family metrics — tf->nbits=36, tf->h=11, tf->width_at_border=8,
//                tf->total_width=10, tf->reversed_border=false.
//   bitmap()   — a direct port of apriltag_to_image() in apriltag.c
//                (see the comment on bitmap() for the line-by-line mapping).
//
// A transcription is worth nothing on its own. `node marker/test.mjs` renders
// these bitmaps with raster.js and feeds them to the vendored AprilTag WASM
// detector; the detector reports the ID it decoded. If a single bit were
// wrong the tag would decode as a different ID or not at all — tag36h11 has a
// minimum Hamming distance of 11 and the detector is configured to accept 0
// bit errors in the acceptance suite. That round trip, not this comment, is
// the proof.

/** Family constants, straight out of tag36h11_create(). */
export const FAMILY = Object.freeze({
  name: 'tag36h11',
  nbits: 36,
  h: 11,
  ncodes: 587,
  /** Modules across the full printed bitmap (black border + 1-module white ring). */
  totalWidth: 10,
  /** Modules across the black border square — this is what the detector locates. */
  widthAtBorder: 8,
  reversedBorder: false,
});

/**
 * codedata[id] for the IDs this sheet uses.
 * Letter uses 0-3, A4 uses 10-13 (see sheet.js).
 */
export const CODES = Object.freeze({
  0: 0x0000000d7e00984bn,
  1: 0x0000000dda664ca7n,
  2: 0x0000000dc4a1c821n,
  3: 0x0000000e17b470e9n,
  10: 0x000000033eb19ca6n,
  11: 0x00000003f76eb0f8n,
  12: 0x0000000469a97414n,
  13: 0x000000045dcfe0b0n,
});

/** tf->bit_x[0..35] — column of data bit i inside the 6x6 payload. */
export const BIT_X = Object.freeze([
  1, 2, 3, 4, 5, 2, 3, 4, 3, 6, 6, 6, 6, 6, 5, 5, 5, 4,
  6, 5, 4, 3, 2, 5, 4, 3, 4, 1, 1, 1, 1, 1, 2, 2, 2, 3,
]);

/** tf->bit_y[0..35] — row of data bit i inside the 6x6 payload. */
export const BIT_Y = Object.freeze([
  1, 1, 1, 1, 1, 2, 2, 2, 3, 1, 2, 3, 4, 5, 2, 3, 4, 3,
  6, 6, 6, 6, 6, 5, 5, 5, 4, 6, 5, 4, 3, 2, 5, 4, 3, 4,
]);

/** The IDs this module carries patterns for. */
export const KNOWN_IDS = Object.freeze(Object.keys(CODES).map(Number).sort((a, b) => a - b));

/**
 * Render the canonical 10x10 module bitmap for a tag36h11 ID.
 *
 * Port of apriltag_to_image() (apriltag.c). The C original writes 0 (black)
 * or 255 (white) into an image_u8_t; we return 0/1 in a Uint8Array where
 * 1 = white, 0 = black, row-major, `FAMILY.totalWidth` wide.
 *
 *   image starts all-black                       -> fill(0)
 *   white_border_width = width_at_border + 2 = 10 (reversed_border false)
 *   white_border_start = (10 - 10) / 2 = 0       -> the 1-module white ring
 *                                                   is the outermost ring
 *   border_start = (10 - 8) / 2 = 1              -> payload offset
 *   bit i is set  ->  pixel (bit_y[i]+1, bit_x[i]+1) becomes white
 *   bit i is MSB-first: code & (1 << (nbits - i - 1))
 *
 * Rows 1 and 8 / columns 1 and 8 are never written, so they stay black —
 * that is the black border the detector's quad finder latches onto.
 *
 * @param {number} id tag36h11 ID; must be one of KNOWN_IDS
 * @returns {Uint8Array} totalWidth*totalWidth entries, 1 = white, 0 = black
 */
export function bitmap(id) {
  const code = CODES[id];
  if (code === undefined) {
    throw new Error(`tags36h11: no embedded pattern for id ${id} (have ${KNOWN_IDS.join(', ')})`);
  }
  const n = FAMILY.totalWidth;
  const px = new Uint8Array(n * n); // 0 = black everywhere to start

  // 1-module white ring around the outside.
  for (let i = 0; i < n; i += 1) {
    px[i] = 1;
    px[(n - 1) * n + i] = 1;
    px[i * n] = 1;
    px[i * n + (n - 1)] = 1;
  }

  const borderStart = (FAMILY.totalWidth - FAMILY.widthAtBorder) / 2; // 1
  for (let i = 0; i < FAMILY.nbits; i += 1) {
    const on = (code >> BigInt(FAMILY.nbits - i - 1)) & 1n;
    if (on) px[(BIT_Y[i] + borderStart) * n + (BIT_X[i] + borderStart)] = 1;
  }
  return px;
}

/** Debug helper: the bitmap as text, '#' = black module, '.' = white. */
export function bitmapAscii(id) {
  const n = FAMILY.totalWidth;
  const px = bitmap(id);
  const rows = [];
  for (let y = 0; y < n; y += 1) {
    let row = '';
    for (let x = 0; x < n; x += 1) row += px[y * n + x] ? '.' : '#';
    rows.push(row);
  }
  return rows.join('\n');
}
