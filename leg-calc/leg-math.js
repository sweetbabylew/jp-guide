// leg-math.js — the arithmetic behind the leg calculator. No DOM in here.
//
// One leg is a straight line from a mortise mark on the seat to a foot on the
// floor. Everything is measured from two edges of the seat that meet at a
// corner: the SIDE edge and the END edge (the front edge or the back edge).
//
//   mSide, mEnd   the mortise, in from the side edge and in from the end edge,
//                 measured on the seat
//   fSide, fEnd   the foot, from the same two edges, plumb below them
//                 (0 = under the edge, negative = out past the edge)
//   height        floor up to the seat at the end edge, plumb
//   length        along the centre of the leg, mark to floor
//   tilt          degrees the seat drops toward the back (0 = level)
//   tenonDia      how thick the tenon is where it comes out of the seat
//   footDia       how thick the leg is at the floor
//
//   splay   lean seen from the front, + = foot toward the side edge
//   rake    lean seen from the side,  + = foot toward the end edge
//   result  resultant: the one true lean, off the line square to the seat
//   sight   sightline: off the side-to-side line through the mortise,
//           0 = leans straight sideways, 90 = straight toward the front or back
//
// All four angles are read against the SEAT, because that is what the brace
// sits on. With a tilted seat the same leg read against the floor comes back
// as rakeFloor, splayFloor and plumbAngle.
//
// The sightline and resultant conventions, and the tilt arithmetic, are
// chairagram's (chairagram/renderer/src/angles.js, DRAWING-CONVENTIONS.md
// section 3), and test.mjs holds the two apps to the same numbers.
//
// A stretcher is a level stick between two legs at one height off the floor
// (solveStretcher, at the foot of the file). To put two legs in one picture
// it needs the seat's width, its depth, or both.
//
// The file loads as a plain <script> so the page opens from a double-click,
// and Node imports it for its side effect (test.mjs).

(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  var MM_PER_IN = 25.4;

  function gcd(a, b) {
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  // Text to a number in `units` ('in' or 'mm').
  // Blank gives null, anything unreadable gives NaN.
  // Reads 17, 17.5, 17 1/2, 17-1/2, 3/4, -1/2, and a trailing ", in or mm
  // (a length typed in the other unit is converted).
  function parseLength(text, units) {
    if (text == null) return null;
    var s = String(text).trim().toLowerCase();
    if (s === '') return null;
    var given = null;
    var u = s.match(/(mm|inches|inch|in\.?|"|″|”|'')$/);
    if (u) {
      given = u[1] === 'mm' ? 'mm' : 'in';
      s = s.slice(0, u.index).trim();
    }
    s = s.replace(/[−–—]/g, '-').replace(',', '.');
    var sign = 1;
    if (s.charAt(0) === '-') { sign = -1; s = s.slice(1).trim(); }
    else if (s.charAt(0) === '+') { s = s.slice(1).trim(); }
    var v;
    var m;
    if ((m = s.match(/^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)$/))) v = +m[1] + (+m[2]) / (+m[3]);
    else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) v = (+m[1]) / (+m[2]);
    else if (/^(\d+\.?\d*|\.\d+)$/.test(s)) v = parseFloat(s);
    else return NaN;
    if (!isFinite(v)) return NaN;
    v *= sign;
    if (given && given !== units) v = given === 'mm' ? v / MM_PER_IN : v * MM_PER_IN;
    return v;
  }

  // Text to degrees. Blank gives null, unreadable gives NaN.
  function parseAngle(text) {
    if (text == null) return null;
    var s = String(text).trim().toLowerCase().replace(/[−–—]/g, '-').replace(',', '.');
    if (s === '') return null;
    s = s.replace(/\s*(°|degrees|degree|deg)$/, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function trimZeros(s) {
    return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }

  // Inches as a tape reads them, to the nearest 1/den: "13 1/16", "3/4", "-1/2".
  function inchFraction(value, den) {
    den = den || 16;
    var n = Math.round(Math.abs(value) * den);
    var whole = Math.floor(n / den);
    var num = n - whole * den;
    var out;
    if (num === 0) out = String(whole);
    else {
      var g = gcd(num, den);
      out = (whole ? whole + ' ' : '') + (num / g) + '/' + (den / g);
    }
    return (value < 0 && n !== 0 ? '-' : '') + out;
  }

  // A length for reading: inches to the 1/16, millimetres to the 0.1. No unit.
  function formatLength(value, units) {
    if (units === 'mm') {
      var r = Math.round(value * 10) / 10;
      return trimZeros((r === 0 ? 0 : r).toFixed(1));
    }
    return inchFraction(value, 16);
  }

  // A length for an "at least": rounded up, never down. Inches to the next
  // 1/16, millimetres to the next whole one.
  function formatLengthUp(value, units) {
    if (units === 'mm') return String(Math.ceil(value - 1e-9) || 0);
    return inchFraction(Math.ceil(value * 16 - 1e-9) / 16, 16);
  }

  // A length to put back into a typing box without losing much: a fraction
  // when it is one (to the 1/64), otherwise decimals.
  function inputText(value, units) {
    if (units === 'mm') return trimZeros((Math.round(value * 100) / 100 || 0).toFixed(2));
    var n = Math.round(value * 64);
    if (Math.abs(value * 64 - n) < 1e-6) return inchFraction(value, 64);
    return trimZeros((Math.round(value * 1000) / 1000 || 0).toFixed(3));
  }

  function formatAngle(deg) {
    var r = Math.round(deg * 10) / 10;
    return (r === 0 ? 0 : r).toFixed(1) + '°';
  }

  // An angle to put back into a typing box: two decimals at most.
  function angleInputText(deg) {
    return trimZeros((Math.round(deg * 100) / 100 || 0).toFixed(2));
  }

  function fail(error, extra) {
    var o = { ok: false, error: error };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  // Which numbers a question needs before it can be answered.
  function needed(q) {
    var need = [];
    if (q.find !== 'mortise') need.push('mSide', 'mEnd');
    if (q.find !== 'foot') need.push('fSide', 'fEnd');
    need.push(q.known === 'length' ? 'length' : 'height');
    if (q.find !== 'angle') {
      if (q.pair === 'rs') need.push('rake', 'splay');
      else need.push('result', 'sight');
    }
    return need;
  }

  // Answer one leg.
  //   q.find   'angle'   mortise + foot known, angles wanted
  //            'foot'    mortise + angles known, foot wanted
  //            'mortise' foot + angles known, mortise wanted
  //   q.known  'height' or 'length': which of the two is typed in
  //   q.pair   'sr' (resultant + sightline) or 'rs' (rake + splay): which
  //            pair of angles is typed in when the angles are known
  //   q.end    'front' or 'back': which end edge the leg is measured from
  //   q.tilt   degrees the seat drops toward the back; null or 0 = level
  //   q.tenonDia, q.footDia   how thick the tenon is at the seat and the leg
  //            is at the floor; either one given brings back what sawing the
  //            ends flush takes off the leg
  // Numbers are plain numbers in one unit; null means not typed yet.
  //
  // The working, with the seat tipped by `tilt` about its side-to-side line:
  //   toward the front, along the seat   s = (front · cos, up · sin)
  //   square to the seat, downward       n = (front · sin, down · cos)
  // A leg that goes dSide sideways, dFront toward the front and drops Hm reads
  //   along n:  Hm cos + dFront sin      along s:  dFront cos − Hm sin
  // and every angle against the seat is a ratio of those two and dSide.
  function solveLeg(q) {
    var need = needed(q);
    var unreadable = need.concat(['thick', 'tilt', 'tenonDia', 'footDia']).filter(function (k) {
      return typeof q[k] === 'number' && isNaN(q[k]);
    });
    if (unreadable.length) return { ok: false, unreadable: unreadable };
    var missing = need.filter(function (k) { return q[k] == null; });
    if (missing.length) return { ok: false, missing: missing };

    var tilt = q.tilt == null ? 0 : q.tilt;
    if (Math.abs(tilt) >= 45) return fail('tilt-range');
    if (q.thick != null && q.thick < 0) return fail('thick-negative');
    if ((q.tenonDia != null && q.tenonDia < 0) || (q.footDia != null && q.footDia < 0)) return fail('dia-negative');
    if (q.known === 'length' && !(q.length > 0)) return fail('length-zero');
    if (q.known !== 'length' && !(q.height > 0)) return fail('height-zero');

    var c = Math.cos(tilt * DEG), s = Math.sin(tilt * DEG);
    var sF = q.end === 'back' ? -1 : 1; // +1 when "toward the end edge" is toward the front
    var mSide = q.mSide, mEnd = q.mEnd, fSide = q.fSide, fEnd = q.fEnd;
    var Hm;      // plumb height of the mortise mark
    var dSide;   // mortise to foot, level, toward the side edge
    var dEndH;   // mortise to foot, level, toward the end edge

    if (q.find === 'angle') {
      dSide = mSide - fSide;
      dEndH = mEnd * c - fEnd;
      if (q.known === 'length') {
        var flat = Math.hypot(dSide, dEndH);
        if (q.length <= flat) return fail('too-short', { run: flat });
        Hm = Math.sqrt(q.length * q.length - flat * flat);
      } else {
        Hm = q.height - sF * mEnd * s;
      }
    } else {
      var ts, te; // tangents against the seat: toward the side edge, toward the end edge
      if (q.pair === 'rs') {
        if (Math.abs(q.rake) >= 90 || Math.abs(q.splay) >= 90) return fail('rake-splay-range');
        te = Math.tan(q.rake * DEG);
        ts = Math.tan(q.splay * DEG);
      } else {
        if (q.result < 0 || q.result >= 90) return fail('resultant-range');
        if (q.sight < 0 || q.sight > 90) return fail('sightline-range');
        var t = Math.tan(q.result * DEG);
        te = t * Math.sin(q.sight * DEG);
        ts = t * Math.cos(q.sight * DEG);
      }
      var tf = sF * te;           // toward the front, along the seat
      var down = c - tf * s;      // plumb drop per unit square to the seat
      if (!(down > 1e-9)) return fail('leg-level');
      var g = (tf * c + s) / down; // the lean toward the front, read against the floor
      var norm = Math.sqrt(1 + ts * ts + te * te);
      if (q.find === 'foot') {
        Hm = q.known === 'length' ? q.length * down / norm : q.height - sF * mEnd * s;
        dSide = Hm * ts / down;
        dEndH = sF * Hm * g;
        fSide = mSide - dSide;
        fEnd = mEnd * c - dEndH;
      } else {
        if (q.known === 'length') {
          Hm = q.length * down / norm;
          dEndH = sF * Hm * g;
          mEnd = (fEnd + dEndH) / c;
        } else {
          // The mortise's own height depends on where it ends up, so both
          // come out of one line: mEnd·cos = fEnd + dEndH, Hm = height − sF·mEnd·sin.
          mEnd = (fEnd + sF * g * q.height) * down;
          Hm = q.height - sF * mEnd * s;
          dEndH = sF * Hm * g;
        }
        dSide = Hm * ts / down;
        mSide = fSide + dSide;
      }
    }
    if (!(Hm > 0)) return fail('mortise-on-floor');

    var dFront = sF * dEndH;
    var alongN = Hm * c + dFront * s;
    var alongS = dFront * c - Hm * s;
    if (!(alongN > 1e-12)) return fail('leg-level');
    var lean = Math.hypot(dSide, alongS);
    var run = Math.hypot(dSide, dEndH);
    var length = q.known === 'length' ? q.length : Math.hypot(run, Hm);
    var square = lean <= 1e-9 * Math.max(1, alongN);
    var out = {
      ok: true,
      mSide: mSide, mEnd: mEnd, fSide: fSide, fEnd: fEnd,
      height: Hm + sF * mEnd * s,
      heightAtMortise: Hm,
      length: length,
      run: run,
      dSide: dSide,
      dEnd: dEndH,
      tilt: tilt,
      // against the seat
      rake: Math.atan(sF * alongS / alongN) / DEG,
      splay: Math.atan(dSide / alongN) / DEG,
      result: Math.atan(lean / alongN) / DEG,
      sight: square ? 0 : Math.atan2(Math.abs(alongS), Math.abs(dSide)) / DEG,
      plumb: square, // square to the seat: no sightline exists
      // against the floor
      rakeFloor: Math.atan(dEndH / Hm) / DEG,
      splayFloor: Math.atan(dSide / Hm) / DEG,
      plumbAngle: Math.atan(run / Hm) / DEG,
      // for drawing from above: the mortise as seen plumb from above, and the
      // way the sightline runs (toward the side edge, toward the end edge)
      mEndPlan: mEnd * c,
      sightSide: dSide,
      sightEnd: sF * alongS * c,
    };
    // Where the seat ends in the direction the leg leans: how far, level, from
    // the mortise to the first of the two known edges, and which one it is.
    // Null when the leg leans away from both, or the mortise is off the seat.
    out.edgeRun = null;
    out.edgeName = null;
    if (run > 0 && mSide >= 0 && out.mEndPlan >= 0) {
      if (dSide > 1e-12) { out.edgeRun = mSide * run / dSide; out.edgeName = 'side'; }
      if (dEndH > 1e-12) {
        var toEnd = out.mEndPlan * run / dEndH;
        if (out.edgeRun == null || toEnd < out.edgeRun) { out.edgeRun = toEnd; out.edgeName = 'end'; }
      }
    }
    if (q.thick != null && q.thick > 0) {
      out.thick = q.thick;
      // The slanted distance the leg travels inside a seat this thick.
      out.through = q.thick * Math.hypot(lean, alongN) / alongN;
    }
    // What sawing the two ends flush takes off the leg, along its centre. A
    // round end cut on a slant is an ellipse, and the square end of the blank
    // has to clear the ellipse's far side: half the thickness times the
    // tangent of the slant, past the point where the centre line comes out.
    // The tenon is slanted against the seat, the foot against the floor.
    if (q.tenonDia != null) {
      out.tenonDia = q.tenonDia;
      out.trimTenon = q.tenonDia / 2 * lean / alongN;
    }
    if (q.footDia != null) {
      out.footDia = q.footDia;
      out.trimFoot = q.footDia / 2 * run / Hm;
    }
    if (out.trimTenon != null || out.trimFoot != null) {
      // The shortest blank: mark to floor plus both cuts, and the same with
      // the part inside the seat added for a mark on the underside.
      out.rough = length + (out.trimTenon || 0) + (out.trimFoot || 0);
      if (out.through != null) out.roughThrough = out.rough + out.through;
    }
    return out;
  }

  // Which numbers a stretcher needs before it can be answered.
  function stretcherNeeds(q) {
    var need = ['height'];
    if (q.across) need.push('width');
    if (q.a.end !== q.b.end) need.push('depth');
    return need;
  }

  // One stretcher: a straight, level stick between two legs that goes right
  // through both of them.
  //   q.a, q.b        the two legs, each an answer from solveLeg with its
  //                   `end` ('front' or 'back') added
  //   q.across        true when leg b is the one on the far side of the chair;
  //                   a leg and itself, across, is the pair left and right
  //   q.width         side edge to side edge, needed when across
  //   q.depth         front edge to back edge measured on the seat, needed
  //                   when one leg is measured from the front and the other
  //                   from the back
  //   q.height        floor up to the centre of the stretcher, plumb, the
  //                   same on both legs
  //   q.stretcherDia  how thick the stretcher is where it goes through a leg
  //   q.legDia        how thick the legs are where it goes through them
  //
  // Each leg is taken as a straight round stick about its centre line, as
  // thick as legDia where the stretcher crosses it. Say the stretcher meets
  // the leg at an angle A (90 = square), the leg is R thick from its centre
  // and the tenon r. The stretcher's centre line comes out of the far side of
  // the leg R / sin A past the leg's centre. The tenon's rim comes out last on
  // the side the leg leans away to, r cos A / sin A further on: the same
  // half-the-thickness-times-the-slant as a foot sawn flush with the floor.
  function solveStretcher(q) {
    var need = stretcherNeeds(q);
    var unreadable = need.concat(['stretcherDia', 'legDia']).filter(function (k) {
      return typeof q[k] === 'number' && isNaN(q[k]);
    });
    if (unreadable.length) return { ok: false, unreadable: unreadable };
    var missing = need.concat(['stretcherDia', 'legDia']).filter(function (k) { return q[k] == null; });
    if (missing.length) return { ok: false, missing: missing };

    var h = q.height;
    var seat = Math.min(q.a.heightAtMortise, q.b.heightAtMortise);
    if (!(h > 0)) return fail('stretcher-low');
    if (!(h < seat)) return fail('stretcher-high', { limit: seat });
    if (!(q.legDia > 0) || !(q.stretcherDia > 0)) return fail('dia-zero');
    if (q.stretcherDia > q.legDia) return fail('tenon-fat');
    var useDepth = q.a.end !== q.b.end;
    var depthPlan = useDepth ? q.depth * Math.cos(q.a.tilt * DEG) : 0;
    if (q.across && !(q.width >= q.a.mSide + q.b.mSide)) return fail('width-small', { limit: q.a.mSide + q.b.mSide });
    if (useDepth && !(depthPlan >= q.a.mEndPlan + q.b.mEndPlan)) return fail('depth-small');

    // Both legs in one frame: x from this side's edge toward the far side, y
    // from the front edge toward the back (or, when both legs are measured
    // from the same edge, from that edge), z up from the floor.
    function place(leg, far) {
      var back = useDepth && leg.end === 'back';
      var point = function (side, endPlan, z) {
        return [far ? q.width - side : side, back ? depthPlan - endPlan : endPlan, z];
      };
      var foot = point(leg.fSide, leg.fEnd, 0);
      var top = point(leg.mSide, leg.mEndPlan, leg.heightAtMortise);
      var t = h / leg.heightAtMortise;
      return { foot: foot, top: top, at: [foot[0] + t * (top[0] - foot[0]), foot[1] + t * (top[1] - foot[1])] };
    }
    var A = place(q.a, false);
    var B = place(q.b, !!q.across);
    var dx = B.at[0] - A.at[0], dy = B.at[1] - A.at[1];
    var between = Math.hypot(dx, dy);
    if (!(between > 1e-9)) return fail('legs-touch');
    var ux = dx / between, uy = dy / between;
    var R = q.legDia / 2, r = q.stretcherDia / 2;
    function meet(P) {
      var ax = P.top[0] - P.foot[0], ay = P.top[1] - P.foot[1], az = P.top[2];
      var cos = Math.min(1, Math.abs(ax * ux + ay * uy) / Math.hypot(ax, ay, az));
      var sin = Math.sqrt(1 - cos * cos);
      return {
        offSquare: Math.asin(cos) / DEG,
        face: R / sin,                 // the leg's centre to its face, along the stretcher
        through: (R + r * cos) / sin,  // the leg's centre to the last of the tenon's rim
        // for drawing square to the stretcher: how far along it, from where it
        // crosses leg a, the foot and the mortise are, and how high the mortise is
        footAt: (P.foot[0] - A.at[0]) * ux + (P.foot[1] - A.at[1]) * uy,
        topAt: (P.top[0] - A.at[0]) * ux + (P.top[1] - A.at[1]) * uy,
        topHeight: P.top[2],
      };
    }
    var ma = meet(A), mb = meet(B);
    var gap = between - ma.face - mb.face;
    if (!(gap > 0)) return fail('legs-touch');
    return {
      ok: true,
      height: h,
      stretcherDia: q.stretcherDia,
      legDia: q.legDia,
      between: between,           // centre of one leg to centre of the other
      gap: gap,                   // inside face to inside face, along the stretcher's centre
      throughA: ma.through,
      throughB: mb.through,
      length: between + ma.through + mb.through,
      offSquareA: ma.offSquare,   // how far off square the stretcher meets each leg
      offSquareB: mb.offSquare,
      a: ma,
      b: mb,
    };
  }

  root.LegMath = {
    stretcherNeeds: stretcherNeeds,
    solveStretcher: solveStretcher,
    MM_PER_IN: MM_PER_IN,
    parseLength: parseLength,
    parseAngle: parseAngle,
    formatLength: formatLength,
    formatLengthUp: formatLengthUp,
    inputText: inputText,
    formatAngle: formatAngle,
    angleInputText: angleInputText,
    needed: needed,
    solveLeg: solveLeg,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
