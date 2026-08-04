// angles.js — leg/stick angle math (SPEC.md § Angle conventions).
//
// rake  : deg from vertical in the SIDE view, + = foot toward the back (+Z)
// splay : deg from vertical in the FRONT view, + = foot outboard
//
//   resultant = atan( sqrt( tan²rake + tan²splay ) )
//   sightline = atan2( |tan rake|, |tan splay| )      <- datum below

export const DEG = Math.PI / 180;

export const toRad = (deg) => deg * DEG;
export const toDeg = (rad) => rad / DEG;

/**
 * ===========================================================================
 * THE SIGHTLINE DATUM — the one place the convention lives.
 * ===========================================================================
 *
 * Returns the sightline in degrees measured off the seat's TRANSVERSE
 * (side-to-side) baseline:
 *
 *   splay-only leg (rake = 0)  ->   0°   (leans straight sideways)
 *   rake-only leg  (splay = 0) ->  90°   (leans straight fore-and-aft)
 *
 * atan2 is mandatory — splay = 0 is the common case (both JP pieces) and must
 * not divide by zero. Magnitudes are used, so the result is always in [0, 90]:
 * the sightline is a LINE on the seat, not a direction; which way the leg
 * actually kicks is carried by the signs of rake/splay and drawn from them.
 *
 * TODO(chairpanzee): verify this datum against Chairpanzee / Galbert's
 * published tables before the renderer ships. DESIGN.md records that the
 * equivalent centerline-datum form is the complement (90° − this value); if
 * the published convention turns out to be the centerline one, flip it HERE
 * and nowhere else — every consumer (angle table, seat plan sightlines,
 * angles.json) reads this function.
 */
export function sightlineFromTransverseDatum(rakeDeg, splayDeg) {
  const tr = Math.abs(Math.tan(toRad(rakeDeg)));
  const ts = Math.abs(Math.tan(toRad(splayDeg)));
  if (tr === 0 && ts === 0) return 0; // plumb leg: no sightline exists
  return toDeg(Math.atan2(tr, ts));
}

/** Resultant (the bevel-gauge angle off vertical, in the sightline plane). */
export function resultantAngle(rakeDeg, splayDeg) {
  const tr = Math.tan(toRad(rakeDeg));
  const ts = Math.tan(toRad(splayDeg));
  return toDeg(Math.atan(Math.hypot(tr, ts)));
}

/** Both derived angles for one leg. */
export function legAngles(rakeDeg, splayDeg) {
  return {
    rake: rakeDeg,
    splay: splayDeg,
    sightline: sightlineFromTransverseDatum(rakeDeg, splayDeg),
    resultant: resultantAngle(rakeDeg, splayDeg),
    plumb: rakeDeg === 0 && splayDeg === 0,
  };
}

/**
 * Seat slope: degrees the seat top falls from front edge to back edge.
 * POSITIVE means the seat is HIGHER AT THE FRONT and slopes down toward the
 * back, which is what both JP pieces do. Used as the datum for the elevation
 * stick-angle label (see below), as the crest tilt when
 * `crest.tiltRef === "seat"`, and as the frame shift for drilling angles.
 */
export function seatSlope(heightFront, heightBack, depth) {
  return toDeg(Math.atan((heightFront - heightBack) / depth));
}

/**
 * ===========================================================================
 * THE DRILLING FRAME — the same leg, read against the SEAT instead of the floor
 * ===========================================================================
 *
 * Storage stays floor-frame (SPEC.md is unchanged). But a chairmaker does not
 * drill from the floor; the brace sits on the seat, so the angle that matters at
 * the bench is the leg measured off the SEAT'S OWN perpendicular.
 *
 * The seat is tilted about its TRANSVERSE (side-to-side) axis by `slopeDeg`,
 * positive = higher at the front. Rotating the leg's direction vector into that
 * frame is one rotation about X. Writing the leg's downward direction as
 * (tan splay, -1, tan rake) and rotating by -slope:
 *
 *   tan(rake_seat) = (tan slope + tan rake) / (1 - tan rake · tan slope)
 *                  = tan(rake + slope)
 *
 * so the RAKE column is exact simple addition — the rotation happens entirely
 * in the sagittal plane the rake is measured in. Nothing else is:
 *
 *   tan(splay_seat) = tan(splay) · cos(rake) / cos(rake_seat)
 *
 * The seat tipping back foreshortens the leg's vertical component, so the SAME
 * sideways lean reads as more splay against the seat. It is identity only when
 * splay is 0 (both JP pieces, so nothing shipped so far moves) or when the leg
 * has no rake. Sightline and resultant are then the ordinary formulas applied to
 * the seat-frame pair — which is exactly what layout.computer does, and
 * reproducing their published shop-card numbers that way matched to the degree
 * (RESEARCH.md deep-dive: 12°→9° front, 19°→22° back, sightlines 31°/55°,
 * resultants 17°/26°).
 *
 * FOR A MEMBER RUNNING DOWN THROUGH THE SEAT — a leg. A stick runs UP through
 * the same tilted board, so the same slope SUBTRACTS for it: see
 * `stickAngleOffSeatPerpendicular` below. That sign difference is real, not a
 * bug: the two members point opposite ways through one piece of wood.
 */
export function seatFrameAngles(rakeDeg, splayDeg, slopeDeg) {
  const rake = rakeDeg + slopeDeg;
  const cs = Math.cos(toRad(rake));
  // |rake_seat| = 90° means the leg lies IN the seat plane — no chair does this,
  // but the formula must not divide by zero on the way to saying so.
  const splay = Math.abs(cs) < 1e-9
    ? splayDeg
    : toDeg(Math.atan((Math.tan(toRad(splayDeg)) * Math.cos(toRad(rakeDeg))) / cs));
  return legAngles(rake, splay);
}

/**
 * The stick angle as the legacy drawings label it: measured off the SLOPED
 * SEAT's perpendicular, not off plumb (SPEC.md § sticks.lean, DIMENSIONS §4.3).
 *   chair 18.66 − 5.17 = 13.49  ->  "13 1/2°"
 *   bench 15.35 − 2.37 = 12.98  ->  "13°"
 *
 * This is the drilling frame for a stick, and the MINUS is why it reads
 * opposite to `seatFrameAngles`: a stick leans back going UP out of the seat, a
 * leg rakes back going DOWN out of it, so one tilt adds and the other subtracts.
 * Sticks have no side lean in the schema, so there is no splay term here — the
 * rotation stays in the sagittal plane and the difference is exact.
 */
export function stickAngleOffSeatPerpendicular(leanDeg, slopeDeg) {
  return leanDeg - slopeDeg;
}

/**
 * Plan-view direction of a leg's sightline, as a unit (x, z) vector pointing
 * the way the FOOT is displaced. Splay is signed outboard, so the sign of the
 * mortise x decides which way "outboard" is.
 */
export function sightlineDirection(rakeDeg, splayDeg, mortiseX) {
  const outboard = mortiseX < 0 ? -1 : 1;
  const dx = outboard * Math.tan(toRad(splayDeg));
  const dz = Math.tan(toRad(rakeDeg));
  const len = Math.hypot(dx, dz);
  if (len === 0) return { x: 0, z: 0, defined: false };
  return { x: dx / len, z: dz / len, defined: true };
}
