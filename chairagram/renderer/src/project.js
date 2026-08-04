// project.js — orthographic projections of the chair frame into panel space.
//
// Panel space is SVG-ish: +x right, +y DOWN, origin at the projected chair
// origin (centre of the seat front edge, at the floor). Scale is applied here
// (10 px = 1 in via `pxPerUnit`), so panels work in pixels throughout.
//
// FRONT : viewer in front of the chair (-Z), looking at +Z.  screen x = +X
// SIDE  : viewer at the chair's RIGHT (+X). screen x = -Z, so the chair's
//         FRONT is at the right of the panel — the legacy convention
//         (DIMENSIONS.md §0: "side elevation faces left").
// PLAN  : viewed from above. screen x = +X, screen y = -Z, so the seat's FRONT
//         edge is at the BOTTOM of the panel.
// AXO   : parallel projection from front-right-above, azimuth 40°,
//         elevation 25° — looking along the seat diagonal.

import { pxPerUnit } from './style.js';
import { toRad } from './angles.js';

export const AXO_AZIMUTH = 40;
export const AXO_ELEVATION = 25;

export function makeProjector(kind, units) {
  const k = pxPerUnit(units);
  switch (kind) {
    case 'front':
      return {
        kind,
        scale: k,
        /** depth cue: larger = nearer the viewer */
        depth: (p) => -p.z,
        at: (p) => ({ x: p.x * k, y: -p.y * k }),
      };
    case 'side':
      return {
        kind,
        scale: k,
        depth: (p) => p.x,
        at: (p) => ({ x: -p.z * k, y: -p.y * k }),
      };
    case 'plan':
      return {
        kind,
        scale: k,
        depth: (p) => p.y,
        at: (p) => ({ x: p.x * k, y: -p.z * k }),
      };
    case 'axo': {
      const a = toRad(AXO_AZIMUTH);
      const e = toRad(AXO_ELEVATION);
      const ca = Math.cos(a); const sa = Math.sin(a);
      const ce = Math.cos(e); const se = Math.sin(e);
      return {
        kind,
        scale: k,
        // toward the viewer (front-right-above)
        depth: (p) => p.x * sa * ce + p.y * se - p.z * ca * ce,
        at: (p) => ({
          x: (p.x * ca + p.z * sa) * k,
          y: -(-p.x * sa * se + p.y * ce + p.z * ca * se) * k,
        }),
      };
    }
    default:
      throw new Error(`project: unknown panel "${kind}"`);
  }
}

/** Project a list of chair-frame points. */
export function projectAll(proj, pts) {
  return pts.map((p) => proj.at(p));
}

/** Convenience: a 3D point from seat-plan coords + height. */
export function pt(x, y, z) {
  return { x, y, z };
}
