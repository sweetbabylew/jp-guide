// svg.js — minimal, dependency-free SVG element builder.
//
// Everything is a string. Attribute order is fixed by insertion order, numbers
// are rounded to one decimal (legacy convention), so the same spec always
// produces byte-identical output.

import { FONT } from './style.js';

/** One-decimal fixed formatting, with -0 normalised to 0. */
export function num(v) {
  if (!Number.isFinite(v)) throw new Error(`svg: non-finite coordinate (${v})`);
  const s = v.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

/** Two-decimal fixed formatting for stroke widths etc. */
export function num2(v) {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESC[c]);
}

function attrs(map) {
  let out = '';
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined || v === null || v === false) continue;
    out += ` ${k}="${typeof v === 'string' ? esc(v) : v}"`;
  }
  return out;
}

/** Self-closing element. */
export function el(name, map) {
  return `<${name}${attrs(map)}/>`;
}

/** Container element with pre-rendered children. */
export function wrap(name, map, children) {
  const body = Array.isArray(children) ? children.join('\n') : children || '';
  return `<${name}${attrs(map)}>\n${body}\n</${name}>`;
}

export function group(map, children) {
  return wrap('g', map, children);
}

export function line(x1, y1, x2, y2, extra = {}) {
  return el('line', { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), ...extra });
}

export function rect(x, y, w, h, extra = {}) {
  return el('rect', { x: num(x), y: num(y), width: num(w), height: num(h), ...extra });
}

export function ellipse(cx, cy, rx, ry, extra = {}) {
  return el('ellipse', { cx: num(cx), cy: num(cy), rx: num2(rx), ry: num2(ry), ...extra });
}

export function circle(cx, cy, r, extra = {}) {
  return el('circle', { cx: num(cx), cy: num(cy), r: num2(r), ...extra });
}

export function pointList(pts) {
  return pts.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');
}

export function polygon(pts, extra = {}) {
  return el('polygon', { points: pointList(pts), ...extra });
}

export function polyline(pts, extra = {}) {
  return el('polyline', { points: pointList(pts), ...extra });
}

export function path(d, extra = {}) {
  return el('path', { d, ...extra });
}

/**
 * <text>. `opts`: size, fill, anchor, weight, rotate (deg about x,y),
 * letterSpacing, italic, and any data-* passed through in `extra`.
 */
export function text(x, y, content, opts = {}) {
  const {
    size = FONT.dim,
    fill = '#111',
    anchor = 'start',
    weight = 'normal',
    rotate = 0,
    letterSpacing = 0,
    italic = false,
    family = FONT.family,
    ...extra
  } = opts;
  const style = [
    letterSpacing ? `letter-spacing:${letterSpacing}px` : '',
    italic ? 'font-style:italic' : '',
  ].filter(Boolean).join(';');
  const map = {
    x: num(x),
    y: num(y),
    'font-size': size,
    fill,
    'text-anchor': anchor,
    'font-family': family,
    'font-weight': weight,
    ...(style ? { style } : {}),
    ...(rotate ? { transform: `rotate(${num(rotate)} ${num(x)} ${num(y)})` } : {}),
    ...extra,
  };
  return `<text${attrs(map)}>${esc(content)}</text>`;
}

/** Rough advance width of a Helvetica string — used only for bbox padding. */
export function textWidth(content, size) {
  return String(content).length * size * 0.55;
}

/** Whole document. `viewBox` in px; width/height may carry real-world units. */
export function svgDocument({ width, height, viewBox, children, title }) {
  const head =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">`;
  const t = title ? `\n<title>${esc(title)}</title>` : '';
  return `${head}${t}\n${Array.isArray(children) ? children.join('\n') : children}\n</svg>\n`;
}
