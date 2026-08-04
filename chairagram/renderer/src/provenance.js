// provenance.js — what an exported artifact is allowed to call itself.
//
// DECISIONS D10: the template must never impersonate output. The app enforced
// that on screen and not at all on the way out — every sheet.svg was titled
// "measured drawing" whatever was in it, and seat-pattern.svg, a 1:1
// FABRICATION pattern, said nothing about where its shape came from. This
// module is the artifact half of the same rule.
//
// Renderer-neutral by construction: the caller hands in plain counts and plain
// strings, ALREADY counted. Nothing here imports app code, inspects a spec, or
// works out a state for itself — the renderer prints what it was handed. A
// caller with no provenance to give gets exactly the old bytes back.

import { FONT, PALETTE, PROVENANCE } from './style.js';
import { text, rect, group } from './svg.js';

/** trust state -> what the artifact may call itself. */
export const ARTIFACT_NAME = Object.freeze({
  none: 'template preview',
  partial: 'measured draft',
  complete: 'measured drawing',
});

/** What an artifact with no provenance at all is called: today's title. */
export const DEFAULT_ARTIFACT = 'measured drawing';

/** The app's own phrasing, and the default for any caller that omits it. */
export const DEFAULT_COUNT_PHRASE = 'from your chair or your answers';

export const WATERMARK_LABEL = 'TEMPLATE — NOT MEASURED';

/**
 * Advance width of exactly that label in Helvetica Bold, in em (summed from
 * the font's own metrics — all-caps runs far wider than the 0.55 em/char
 * rule-of-thumb in svg.js, and a watermark sized by the rule of thumb runs off
 * both edges of the sheet).
 */
const WATERMARK_EM = 15.2;

/** Longest list a single footer line will print before it summarises. */
const LIST_CAP = 6;

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function intOrNull(v) {
  return Number.isInteger(v) && v >= 0 ? v : null;
}

/** A calibration entry, either `"side — set by hand"` or `{view, detail}`. */
function calEntry(e) {
  if (typeof e === 'string') return str(e);
  if (!e || typeof e !== 'object') return null;
  const view = str(e.view);
  const detail = str(e.detail);
  if (!view) return detail;
  return detail ? `${view} — ${detail}` : view;
}

/**
 * The caller's object, made safe to print. Returns null when there is no
 * provenance — which is the signal, everywhere downstream, to change nothing.
 *
 * An unrecognised state reads as 'none'. Somebody who cannot say what they
 * have must not be handed the word "measured"; the loudest answer is the only
 * safe default here.
 */
export function normalizeProvenance(p) {
  if (!p || typeof p !== 'object') return null;
  const state = p.state === 'complete' || p.state === 'partial' ? p.state : 'none';
  const measured = intOrNull(p.measured);
  const total = intOrNull(p.total);
  // Counts are printed only when they are a count. "NaN of undefined" on a
  // fabrication pattern is worse than saying nothing about the numbers.
  const counts = measured !== null && total !== null && total > 0 && measured <= total;
  return {
    state,
    artifact: ARTIFACT_NAME[state],
    measured: counts ? measured : null,
    total: counts ? total : null,
    countPhrase: str(p.countPhrase) || DEFAULT_COUNT_PHRASE,
    templateName: str(p.templateName),
    untraced: (Array.isArray(p.untraced) ? p.untraced : []).map(str).filter(Boolean),
    calibration: (Array.isArray(p.calibration) ? p.calibration : [])
      .map(calEntry).filter(Boolean),
  };
}

/** `a · b · c (+2 more)` — a line that cannot run off the sheet. */
function joinCapped(items) {
  if (items.length <= LIST_CAP) return items.join(' · ');
  return `${items.slice(0, LIST_CAP).join(' · ')} (+${items.length - LIST_CAP} more)`;
}

/** The suffix for a title: today's word when there is no provenance. */
export function artifactName(prov) {
  return prov ? prov.artifact : DEFAULT_ARTIFACT;
}

/**
 * The provenance block, as lines. `tone` picks the colour: 'alert' for a sheet
 * that measured nothing, 'warn' for a partial one, 'plain' for the rest.
 */
export function provenanceLines(prov) {
  if (!prov) return [];
  const out = [];
  const count = prov.total === null ? null : `${prov.measured} of ${prov.total} ${prov.countPhrase}`;
  if (prov.state === 'none') {
    out.push({
      tone: 'alert',
      text: `NOT MEASURED — this sheet is ${prov.templateName ? `the ${prov.templateName} template` : 'a template'}, not your chair.`,
    });
    if (count) out.push({ tone: 'alert', text: `${count}.` });
  } else if (prov.state === 'partial') {
    out.push({
      tone: 'warn',
      text: count
        ? `PARTIAL CAPTURE — ${count}; the rest is template.`
        : 'PARTIAL CAPTURE — part of this drawing is still template.',
    });
  } else {
    out.push({
      tone: 'plain',
      text: count ? `MEASURED — all ${prov.total} ${prov.countPhrase}.` : `MEASURED — ${prov.countPhrase}.`,
    });
  }
  // A count cannot say "the arm bow is invented"; this can. The lead-in is
  // deliberately neutral — the renderer is told only that a shape did not come
  // from the chair, not whose shape it is instead.
  if (prov.untraced.length) {
    out.push({ tone: 'plain', text: `not traced from your chair: ${joinCapped(prov.untraced)}` });
  }
  if (prov.calibration.length) {
    out.push({ tone: 'plain', text: `calibration: ${joinCapped(prov.calibration)}` });
  }
  return out;
}

const TONE_FILL = {
  alert: PROVENANCE.alert,
  warn: PROVENANCE.warn,
  plain: PALETTE.subInk,
};

/**
 * Draw the block at (x, y) — y is the FIRST line's baseline. Returns the svg
 * and the height consumed, so callers lay out around it rather than guessing.
 */
export function provenanceBlock(prov, x, y, { size = FONT.note, step = 14 } = {}) {
  const lines = provenanceLines(prov);
  if (!lines.length) return { svg: '', height: 0, lines: 0 };
  const svg = lines.map((l, i) => text(x, y + i * step, l.text, {
    size,
    fill: TONE_FILL[l.tone] || PALETTE.subInk,
    weight: l.tone === 'plain' ? 'normal' : '700',
    'data-role': `provenance-line-${i}`,
  })).join('\n');
  return { svg, height: (lines.length - 1) * step, lines: lines.length };
}

/**
 * The partial-capture strip: clearly visible, and NOT over the drawing — the
 * caller shifts its content down by `height`. Empty in every other state.
 */
export function bannerStrip(prov, x, y, width) {
  if (!prov || prov.state !== 'partial') return { svg: '', height: 0 };
  const h = 26;
  const label = prov.total === null
    ? 'PARTIAL CAPTURE — part of this drawing is still template'
    : `PARTIAL CAPTURE — ${prov.measured} of ${prov.total} measured, rest is template`;
  const svg = group({ 'data-role': 'provenance-banner' }, [
    rect(x, y, width, h, {
      fill: PROVENANCE.warnSoft, stroke: PROVENANCE.warn, 'stroke-width': '1.0',
    }),
    text(x + 10, y + 17.5, label, {
      size: FONT.note, fill: PROVENANCE.warn, weight: '700', letterSpacing: 0.4,
    }),
  ]);
  return { svg, height: h };
}

/**
 * TEMPLATE — NOT MEASURED, once, diagonally, over everything. Only for a
 * sheet that measured nothing at all; sized to the artifact so it fits a tall
 * narrow seat pattern as well as a wide sheet.
 */
export function watermarkSvg(prov, width, height) {
  if (!prov || prov.state !== 'none') return '';
  const deg = -30;
  const rad = (Math.abs(deg) * Math.PI) / 180;
  // Rotated, the line spans WATERMARK_EM × size × cos across and × sin down;
  // it has to fit inside both, whatever the artifact's proportions — a sheet is
  // tall and wide, a seat pattern can be neither.
  const byWidth = (width * 0.86) / (WATERMARK_EM * Math.cos(rad));
  const byHeight = (height * 0.8) / (WATERMARK_EM * Math.sin(rad));
  const size = Math.max(12, Math.min(96, Math.floor(Math.min(byWidth, byHeight))));
  return group({ 'data-role': 'watermark', 'pointer-events': 'none' }, [
    text(width / 2, height / 2, WATERMARK_LABEL, {
      size,
      fill: PROVENANCE.watermark,
      'fill-opacity': '0.13',
      anchor: 'middle',
      weight: 'bold',
      rotate: deg,
    }),
  ]);
}

/** The same facts, machine-readable, for angles.json. */
export function provenanceJson(prov) {
  if (!prov) return null;
  return {
    state: prov.state,
    artifact: prov.artifact,
    measured: prov.measured,
    total: prov.total,
    countPhrase: prov.countPhrase,
    templateName: prov.templateName,
    untraced: prov.untraced,
    calibration: prov.calibration,
  };
}
