// app.js — the leg calculator's page. The arithmetic is in leg-math.js.
//
// One "chair" is a named list of legs, one seat tilt and one pair of sizes
// for the flush cuts (how thick the tenon and the foot are). Each leg is a
// bird's-eye drawing of the seat with typing boxes on it, where one group of
// numbers is worked out from the others:
//   find  'angle' | 'foot' | 'mortise'   which group is worked out
//   known 'height' | 'length'            which of the two is typed in
//   pair  'sr' | 'rs'                    which pair of angles is typed in
// A chair can also have stretchers. Each one names two of the legs (`from`
// and `to`; `across` when the second is the one on the far side of the chair)
// and a height off the floor, and the page works out how long it has to be to
// go right through both. The seat width, the seat depth and the stretcher's
// tenon thickness are one each for the whole chair.
// Everything typed is kept as text, exactly as typed, and saved in this
// browser (localStorage). Nothing leaves the page.

(function () {
  'use strict';

  var M = window.LegMath;
  var STORE_KEY = 'leg-calculator.v1';
  var LENGTH_KEYS = ['mSide', 'mEnd', 'fSide', 'fEnd', 'height', 'length', 'thick'];
  var ANGLE_KEYS = ['result', 'sight', 'rake', 'splay'];
  var CHAIR_KEYS = ['tilt', 'tenonDia', 'footDia'];
  var CHAIR_LENGTH_KEYS = ['tenonDia', 'footDia'];
  // What an empty flush-cut box stands for: a 1 in tenon and a 1 3/4 in foot
  // (Lewis, 2026-11-14), and the nearest round sizes in millimetres.
  var FLUSH_DEFAULT = { in: { tenonDia: 1, footDia: 1.75 }, mm: { tenonDia: 25, footDia: 45 } };
  // Stretchers: the lengths typed for each one, and the three the chair shares.
  var STRETCH_KEYS = ['height', 'legDia'];
  var STRETCH_CHAIR_KEYS = ['width', 'depth', 'stretcherDia'];
  // What an empty stretcher box stands for: a 5/8 in tenon through a leg
  // 1 1/2 in thick (Claude's pick, 2026-11-15; Lewis has not named sizes).
  var STRETCH_DEFAULT = { in: { stretcherDia: 0.625, legDia: 1.5 }, mm: { stretcherDia: 16, legDia: 38 } };
  var SOLVED_KEYS = ['mSide', 'mEnd', 'fSide', 'fEnd', 'height', 'length', 'result', 'sight', 'rake', 'splay'];
  var COLORS = { ink: '#2a241e', muted: '#655b50', ground: '#eee5d6', rust: '#923f2b', blue: '#315f89', rule: '#d2c1a5' };

  // ---------------------------------------------------------------- state --

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function newLeg(name, end) {
    return {
      id: uid(), name: name, end: end, find: 'angle', known: 'height', pair: 'sr',
      mSide: '', mEnd: '', fSide: '', fEnd: '', height: '', length: '', thick: '',
      result: '', sight: '', rake: '', splay: '',
    };
  }

  function newChair() {
    return {
      id: uid(), name: '', tilt: '', tenonDia: '', footDia: '', width: '', depth: '', stretcherDia: '',
      legs: [newLeg('Front legs', 'front'), newLeg('Back legs', 'back')], stretchers: [],
    };
  }

  function freshState() {
    var c = newChair();
    return { units: 'in', currentId: c.id, chairs: [c] };
  }

  function pick(v, allowed, fallback) { return allowed.indexOf(v) >= 0 ? v : fallback; }

  function load() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(STORE_KEY));
      if (!raw || !Array.isArray(raw.chairs) || !raw.chairs.length) return freshState();
      var chairs = raw.chairs.filter(function (c) { return c && Array.isArray(c.legs); }).map(function (c) {
        return {
          id: String(c.id || uid()),
          name: String(c.name || ''),
          tilt: c.tilt == null ? '' : String(c.tilt),
          tenonDia: c.tenonDia == null ? '' : String(c.tenonDia),
          footDia: c.footDia == null ? '' : String(c.footDia),
          width: c.width == null ? '' : String(c.width),
          depth: c.depth == null ? '' : String(c.depth),
          stretcherDia: c.stretcherDia == null ? '' : String(c.stretcherDia),
          stretchers: (Array.isArray(c.stretchers) ? c.stretchers : []).filter(Boolean).map(function (s) {
            return {
              id: String(s.id || uid()), name: String(s.name || ''), from: String(s.from || ''), to: String(s.to || ''), across: !!s.across,
              height: s.height == null ? '' : String(s.height), legDia: s.legDia == null ? '' : String(s.legDia),
            };
          }),
          legs: c.legs.filter(Boolean).map(function (l) {
            var leg = newLeg(String(l.name || ''), pick(l.end, ['front', 'back'], 'front'));
            leg.id = String(l.id || leg.id);
            leg.find = pick(l.find, ['angle', 'foot', 'mortise'], 'angle');
            leg.known = pick(l.known, ['height', 'length'], 'height');
            leg.pair = pick(l.pair, ['sr', 'rs'], 'sr');
            LENGTH_KEYS.concat(ANGLE_KEYS).forEach(function (k) {
              leg[k] = l[k] == null ? '' : String(l[k]);
            });
            return leg;
          }),
        };
      });
      if (!chairs.length) return freshState();
      var current = chairs.some(function (c) { return c.id === raw.currentId; }) ? raw.currentId : chairs[0].id;
      return { units: pick(raw.units, ['in', 'mm'], 'in'), currentId: current, chairs: chairs };
    } catch (e) {
      return freshState();
    }
  }

  var state = load();
  var canSave = true;

  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
      canSave = true;
    } catch (e) {
      canSave = false;
    }
    document.getElementById('saved-note').textContent = canSave
      ? 'Saved in this browser as you type.'
      : 'This browser is not letting the page save. Copy or print before you close it.';
  }

  function chair() {
    for (var i = 0; i < state.chairs.length; i += 1) if (state.chairs[i].id === state.currentId) return state.chairs[i];
    return state.chairs[0];
  }

  function legById(id) {
    var legs = chair().legs;
    for (var i = 0; i < legs.length; i += 1) if (legs[i].id === id) return legs[i];
    return null;
  }

  // ------------------------------------------------------------- answering --

  function isInput(leg, key) {
    switch (key) {
      case 'mSide': case 'mEnd': return leg.find !== 'mortise';
      case 'fSide': case 'fEnd': return leg.find !== 'foot';
      case 'height': return leg.known === 'height';
      case 'length': return leg.known === 'length';
      case 'result': case 'sight': return leg.find !== 'angle' && leg.pair === 'sr';
      case 'rake': case 'splay': return leg.find !== 'angle' && leg.pair === 'rs';
      default: return true;
    }
  }

  // The tenon or foot thickness for the flush cuts: what is typed, or the
  // usual size when the box is empty.
  function flushDefault(key) { return FLUSH_DEFAULT[state.units === 'mm' ? 'mm' : 'in'][key]; }
  function flushSize(key) {
    var v = M.parseLength(chair()[key], state.units);
    return v == null ? flushDefault(key) : v;
  }

  function solve(leg) {
    var q = { find: leg.find, known: leg.known, pair: leg.pair, end: leg.end, tilt: M.parseAngle(chair().tilt) };
    CHAIR_LENGTH_KEYS.forEach(function (k) { q[k] = flushSize(k); });
    LENGTH_KEYS.forEach(function (k) { q[k] = M.parseLength(leg[k], state.units); });
    ANGLE_KEYS.forEach(function (k) { q[k] = M.parseAngle(leg[k]); });
    return M.solveLeg(q);
  }

  // Change one of a leg's either-or choices. Any box that turns from a
  // worked-out number into a typing box starts with the number it showed, so
  // "the angle came out 22.6, what if I bore at 22?" is one click and one edit.
  function setChoice(leg, prop, value) {
    var before = solve(leg);
    var was = {};
    SOLVED_KEYS.forEach(function (k) { was[k] = isInput(leg, k); });
    leg[prop] = value;
    if (!before.ok) return;
    // Resultant and sightline carry no direction, so a leg that leans away
    // from an edge keeps its lean by going over as rake and splay.
    if (prop === 'find' && value !== 'angle' && (before.rake < -1e-9 || before.splay < -1e-9)) leg.pair = 'rs';
    SOLVED_KEYS.forEach(function (k) {
      if (was[k] || !isInput(leg, k)) return;
      leg[k] = LENGTH_KEYS.indexOf(k) >= 0 ? M.inputText(before[k], state.units) : M.angleInputText(before[k]);
    });
  }

  function unitWord() { return state.units === 'mm' ? 'mm' : 'in'; }
  function len(v) { return M.formatLength(v, state.units) + ' ' + unitWord(); }
  function lenUp(v) { return M.formatLengthUp(v, state.units) + ' ' + unitWord(); }
  function endWord(leg) { return leg.end === 'back' ? 'back' : 'front'; }
  function tilted(r) { return Math.abs(r.tilt) > 1e-9; }

  function shown(key, r) {
    if (!r.ok) return '—';
    return LENGTH_KEYS.indexOf(key) >= 0 ? len(r[key]) : M.formatAngle(r[key]);
  }

  function listWords(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function fieldWords(leg, keys) {
    var e = endWord(leg);
    var names = {
      mSide: 'the mortise from the side edge', mEnd: 'the mortise from the ' + e + ' edge',
      fSide: 'the foot from the side edge', fEnd: 'the foot from the ' + e + ' edge',
      height: 'the height', length: 'the leg length', thick: 'the seat thickness', tilt: 'the seat tilt',
      result: 'the resultant', sight: 'the sightline', rake: 'the rake', splay: 'the splay',
      tenonDia: 'the tenon diameter', footDia: 'the foot diameter',
    };
    var has = function (k) { return keys.indexOf(k) >= 0; };
    var out = [];
    keys.forEach(function (k) {
      if (k === 'mSide' && has('mEnd')) out.push('where the mortise is');
      else if (k === 'mEnd' && has('mSide')) return;
      else if (k === 'fSide' && has('fEnd')) out.push('where the foot lands');
      else if (k === 'fEnd' && has('fSide')) return;
      else out.push(names[k]);
    });
    return listWords(out);
  }

  // Why there is no answer yet, in plain words.
  function explain(leg, r) {
    if (r.unreadable) {
      return {
        problem: true,
        text: 'Cannot read ' + fieldWords(leg, r.unreadable) + '. Lengths read like '
          + (state.units === 'mm' ? '432 or 431.8' : '17 1/2 or 17.5') + ', angles like 22.5.',
      };
    }
    if (r.missing) return { problem: false, text: 'Still needed: ' + fieldWords(leg, r.missing) + '.' };
    var msgs = {
      'height-zero': 'The height has to be more than zero.',
      'length-zero': 'The leg length has to be more than zero.',
      'too-short': 'That leg is too short to reach. Seen from above the foot is ' + (r.run != null ? len(r.run) : 'some way')
        + ' from the mortise, so the leg has to be longer than that.',
      'rake-splay-range': 'Rake and splay each have to be less than 90°.',
      'resultant-range': 'The resultant has to be 0° or more and less than 90°.',
      'sightline-range': 'The sightline runs from 0° (leaning straight sideways) to 90° (leaning straight toward the front or back).',
      'thick-negative': 'The seat thickness cannot be a minus number.',
      'dia-negative': 'The tenon and foot diameters cannot be minus numbers.',
      'tilt-range': 'The seat tilt has to be less than 45°.',
      'mortise-on-floor': 'With that tilt the seat reaches the floor before it reaches the mortise. Check the height and the tilt.',
      'leg-level': 'With those angles the leg never comes down out of the seat.',
    };
    return { problem: true, text: msgs[r.error] || 'These numbers do not make a leg.' };
  }

  // -------------------------------------------------------------- pictures --

  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function line(x1, y1, x2, y2, stroke, width, dash, extra) {
    return '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="' + stroke
      + '" stroke-width="' + width + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round"' + (extra || '') + '/>';
  }
  function text(x, y, s, anchor, cls, extra) {
    return '<text x="' + f1(x) + '" y="' + f1(y) + '" text-anchor="' + (anchor || 'start') + '"'
      + (cls ? ' class="' + cls + '"' : '') + (extra || '') + '>' + s + '</text>';
  }
  function anchorFor(vx) { return vx > 0.35 ? 'start' : vx < -0.35 ? 'end' : 'middle'; }

  // To scale, looking down on the seat: the corner, the mortise, the foot and
  // the sightline. On a tilted seat the sightline does not point at the foot,
  // so it is drawn as its own line.
  function planSvg(leg, r) {
    var W = 300, HH = 250, pad = 38;
    var mEnd = r.mEndPlan;
    var xmin = Math.min(0, r.mSide, r.fSide), xmax = Math.max(0, r.mSide, r.fSide);
    var ymin = Math.min(0, mEnd, r.fEnd), ymax = Math.max(0, mEnd, r.fEnd);
    var span = Math.max(xmax - xmin, ymax - ymin);
    if (!(span > 0)) span = 1;
    var sx = xmax + span * 0.4, sy = ymax + span * 0.4;
    var x0 = xmin - span * 0.1, y0 = ymin - span * 0.1;
    var s = Math.min((W - 2 * pad) / (sx - x0), (HH - 2 * pad) / (sy - y0));
    var back = leg.end === 'back';
    var X = function (x) { return pad + (x - x0) * s; };
    var Y = function (y) { return back ? pad + (y - y0) * s : HH - pad - (y - y0) * s; };
    var cx = X(0), cy = Y(0), ex = X(sx), ey = Y(sy);
    var mx = X(r.mSide), my = Y(mEnd), fx = X(r.fSide), fy = Y(r.fEnd);
    var p = [];
    p.push('<polygon points="' + [cx, cy, ex, cy, ex, ey, cx, ey].map(f1).join(' ') + '" fill="' + COLORS.ground + '"/>');
    p.push(line(cx, cy, ex, cy, COLORS.ink, 2));
    p.push(line(cx, cy, cx, ey, COLORS.ink, 2));
    p.push(text(cx - 8, (cy + ey) / 2, 'side edge', 'middle', 'lbl-muted',
      ' transform="rotate(-90 ' + f1(cx - 8) + ' ' + f1((cy + ey) / 2) + ')"'));
    p.push(text((cx + ex) / 2, cy + (back ? -8 : 16), endWord(leg) + ' edge', 'middle', 'lbl-muted'));

    var legLen = Math.hypot(fx - mx, fy - my);
    if (legLen > 0.5) p.push(line(mx, my, fx, fy, COLORS.rust, 3));
    if (!r.plumb) {
      // The way the sightline runs on the page: toward the side edge is left,
      // toward the end edge is down for a front leg and up for a back leg.
      var wx = -r.sightSide, wy = back ? -r.sightEnd : r.sightEnd;
      var wl = Math.hypot(wx, wy) || 1, ux = wx / wl, uy = wy / wl;
      var bdir = ux >= -1e-6 ? 1 : -1;
      var reach = Math.max(legLen, 40);
      p.push(line(mx - 44, my, mx + 44, my, COLORS.muted, 1, '4 4'));
      p.push(line(mx - ux * 13, my - uy * 13, mx + ux * (reach + 16), my + uy * (reach + 16), COLORS.rust, 1, '5 4'));
      if (r.sight >= 1) {
        var R = 24;
        var sweep = bdir * uy > 0 ? 1 : 0;
        p.push('<path d="M ' + f1(mx + bdir * R) + ' ' + f1(my) + ' A ' + R + ' ' + R + ' 0 0 ' + sweep + ' '
          + f1(mx + ux * R) + ' ' + f1(my + uy * R) + '" fill="none" stroke="' + COLORS.blue + '" stroke-width="1.5"/>');
        var bx = bdir + ux, by = uy, bl = Math.hypot(bx, by) || 1;
        p.push(text(mx + (bx / bl) * (R + 20), my + (by / bl) * (R + 20) + 4, M.formatAngle(r.sight), 'middle', 'num'));
      }
      p.push(text(mx - ux * 20, my - uy * 20 + (Math.abs(uy) < 0.35 ? -9 : 4), 'mortise', anchorFor(-ux)));
    } else {
      p.push(text(mx + 12, my - 10, 'mortise', 'start'));
    }
    if (legLen > 0.5) {
      var lx = (fx - mx) / legLen, ly = (fy - my) / legLen;
      p.push(text(fx + lx * 12, fy + ly * 12 + (Math.abs(ly) < 0.35 ? 13 : 4), 'foot', anchorFor(lx)));
      if (legLen >= 34) {
        // How far the foot is from the mortise, written beside the leg on the
        // side away from the sightline's angle so the two do not collide.
        var nx = -ly, ny = lx;
        if (nx * (lx >= -1e-6 ? 1 : -1) > 0 || (Math.abs(nx) < 1e-6 && ny > 0)) { nx = -nx; ny = -ny; }
        var a = anchorFor(nx);
        p.push(text((mx + fx) / 2 + nx * 9, (my + fy) / 2 + ny * 9 + (a === 'middle' ? (ny > 0 ? 12 : -2) : (ny > 0 ? 10 : 2)),
          len(r.run), a, 'num'));
      }
    }
    p.push('<circle cx="' + f1(mx) + '" cy="' + f1(my) + '" r="6.5" fill="#fff" stroke="' + COLORS.ink + '" stroke-width="1.5"/>');
    p.push(line(mx - 9, my, mx + 9, my, COLORS.ink, 1));
    p.push(line(mx, my - 9, mx, my + 9, COLORS.ink, 1));
    p.push('<circle cx="' + f1(fx) + '" cy="' + f1(fy) + '" r="4.5" fill="' + COLORS.rust + '"/>');
    return '<svg viewBox="0 0 ' + W + ' ' + HH + '" role="img" aria-label="The seat from above, to scale: the mortise, the foot and the sightline">'
      + p.join('') + '</svg>';
  }

  // To scale, looking square at the leg: plumb height, run along the floor,
  // leg length. The seat is drawn as far as its edge in that direction, so a
  // foot that lands outside the seat shows outside it. On a level seat the
  // angle is the resultant; on a tilted seat the seat is not drawn tilted, so
  // the angle shown is the lean off plumb.
  function sideSvg(leg, r) {
    var W = 300, HH = 250, padL = 78, padR = 84, padT = 30, padB = 40;
    var H = r.heightAtMortise;
    var s = Math.min((W - padL - padR) / Math.max(r.run, 1e-9), (HH - padT - padB) / H);
    var tx = padL, ty = padT, fx = padL + r.run * s, fy = padT + H * s;
    var tilt = tilted(r);
    var p = [];
    var seatL = tx - 44, seatFar = W - 14;
    var edgeX = r.edgeRun == null ? null : tx + r.edgeRun * s;
    var ends = edgeX != null && edgeX < seatFar - 4; // the seat's edge is in the picture
    var seatR = ends ? edgeX : seatFar;
    p.push('<rect x="' + f1(seatL) + '" y="' + f1(ty - 10) + '" width="' + f1(seatR - seatL) + '" height="10" fill="' + COLORS.ground + '"/>');
    p.push(line(seatL, ty - 10, seatR, ty - 10, COLORS.ink, 1));
    if (ends) p.push(line(seatR, ty - 10, seatR, ty, COLORS.ink, 1));
    p.push(line(seatL, ty, seatR, ty, COLORS.ink, 3));
    p.push(text(seatL, ty - 15, 'seat', 'start', 'lbl-muted'));
    if (ends) p.push(text(seatR + 7, ty - 1, (r.edgeName === 'side' ? 'side' : endWord(leg)) + ' edge', 'start', 'lbl-muted'));
    p.push(line(14, fy, W - 14, fy, COLORS.ink, 1.5));
    p.push(text(W - 14, fy + 16, 'floor', 'end', 'lbl-muted'));
    p.push(line(tx, ty, tx, fy, COLORS.muted, 1, '4 4'));
    p.push(line(tx, ty, fx, fy, COLORS.rust, 4));
    p.push(text(tx - 8, (ty + fy) / 2 + 4, len(H), 'end', 'num'));
    p.push(text(tx - 8, (ty + fy) / 2 + 19, tilt ? 'at mortise' : 'height', 'end', 'lbl-muted'));
    if (r.run * s > 0.5) {
      var d = Math.hypot(fx - tx, fy - ty) || 1, ux = (fx - tx) / d, uy = (fy - ty) / d;
      p.push(text((tx + fx) / 2 + 12, (ty + fy) / 2 - 13, len(r.length), 'start', 'num'));
      p.push(text((tx + fx) / 2 + 12, (ty + fy) / 2 + 1, 'leg', 'start', 'lbl-muted'));
      p.push(text((tx + fx) / 2, fy + 16, len(r.run), 'middle', 'num'));
      var ang = tilt ? r.plumbAngle : r.result;
      if (ang >= 1) {
        var R = Math.min(40, Math.max(22, d * 0.35));
        p.push('<path d="M ' + f1(tx) + ' ' + f1(ty + R) + ' A ' + f1(R) + ' ' + f1(R) + ' 0 0 0 '
          + f1(tx + ux * R) + ' ' + f1(ty + uy * R) + '" fill="none" stroke="' + COLORS.blue + '" stroke-width="1.5"/>');
        p.push(text(tx + ux * (R + 6) + 8, ty + uy * (R + 6) + 2, M.formatAngle(ang) + (tilt ? ' off plumb' : ''), 'start', 'num'));
      }
    } else {
      p.push(text(tx + 10, (ty + fy) / 2 + 4, 'leg ' + len(r.length), 'start', 'num'));
    }
    return '<svg viewBox="0 0 ' + W + ' ' + HH + '" role="img" aria-label="The leg from the side, to scale: height, leg length and its lean">'
      + p.join('') + '</svg>';
  }

  // ---------------------------------------------------------------- answer --

  function place(v, edge, onIt) {
    var t = M.formatLength(Math.abs(v), state.units);
    if (t === '0') return onIt + ' the ' + edge + ' edge';
    return '<b>' + t + ' ' + unitWord() + '</b> ' + (v < 0 ? 'out past' : 'from') + ' the ' + edge + ' edge';
  }

  function leanWords(deg, toward, away) {
    var t = M.formatAngle(Math.abs(deg));
    if (t === '0.0°') return null;
    return '<b>' + t + '</b> ' + (deg > 0 ? toward : away);
  }

  function answerHtml(leg, r) {
    if (!r.ok) {
      var why = explain(leg, r);
      return '<p class="waiting' + (why.problem ? ' problem' : '') + '">' + why.text + '</p>';
    }
    var e = endWord(leg);
    var tilt = tilted(r);
    var dec = state.units === 'in' ? ' <small>(' + r.length.toFixed(2) + ')</small>' : '';
    var h = '<div class="stats">'
      + '<div class="stat"><b>' + M.formatAngle(r.result) + '</b><span>resultant</span></div>'
      + '<div class="stat"><b>' + (r.plumb ? '—' : M.formatAngle(r.sight)) + '</b><span>sightline</span></div>'
      + '<div class="stat"><b>' + len(r.length) + dec + '</b><span>leg, mark to floor</span></div>'
      + '</div><ul class="says">';
    var toSide = 'out toward the side edge', fromSide = 'in, away from the side edge';
    var toEnd = 'toward the ' + e + ' edge', fromEnd = 'away from the ' + e + ' edge';
    if (r.plumb) {
      h += '<li>' + (tilt ? 'The leg is square to the seat. Bore straight in.' : 'The leg is plumb. Bore square to the seat.') + '</li>';
    } else {
      h += '<li>Bore at <b>' + M.formatAngle(r.result) + '</b> off square to the seat, along a sightline <b>'
        + M.formatAngle(r.sight) + '</b> from the side-to-side line.</li>';
      var sp = leanWords(r.splay, toSide, fromSide);
      var rk = leanWords(r.rake, toEnd, fromEnd);
      h += '<li>' + (tilt ? 'Against the seat, from the front it ' : 'From the front it ') + (sp ? 'splays ' + sp : 'has no splay')
        + '. From the side it ' + (rk ? 'rakes ' + rk : 'has no rake') + '.</li>';
    }
    if (tilt) {
      var spf = leanWords(r.splayFloor, toSide, fromSide);
      var rkf = leanWords(r.rakeFloor, toEnd, fromEnd);
      h += '<li>Standing on the floor, off plumb, it ' + (spf ? 'splays ' + spf : 'has no splay') + ' and '
        + (rkf ? 'rakes ' + rkf : 'has no rake') + '.</li>';
      h += '<li>The seat is <b>' + len(r.heightAtMortise) + '</b> off the floor at the mortise.</li>';
    }
    if (r.run > 0) {
      var across = M.formatLength(Math.abs(r.dSide), state.units) === '0' ? null
        : '<b>' + len(Math.abs(r.dSide)) + '</b> ' + (r.dSide > 0 ? 'toward' : 'away from') + ' the side edge';
      var along = M.formatLength(Math.abs(r.dEnd), state.units) === '0' ? null
        : '<b>' + len(Math.abs(r.dEnd)) + '</b> ' + (r.dEnd > 0 ? 'toward' : 'away from') + ' the ' + e + ' edge';
      h += '<li>Seen from above, the foot is <b>' + len(r.run) + '</b> from the mortise in a straight line'
        + (across && along ? ': ' + across + ' and ' + along : '') + '.</li>';
    }
    if (leg.find === 'foot') {
      var both = M.formatLength(Math.abs(r.fSide), state.units) === '0' && M.formatLength(Math.abs(r.fEnd), state.units) === '0';
      h += '<li>The foot lands ' + (both ? 'under the corner'
        : place(r.fSide, 'side', 'straight under') + ' and ' + place(r.fEnd, e, 'straight under')) + '.</li>';
    }
    if (leg.find === 'mortise') {
      h += '<li>Mark the mortise ' + place(r.mSide, 'side', 'on') + ' and ' + place(r.mEnd, e, 'on') + '.</li>';
    }
    if (leg.known === 'length') h += '<li>The seat sits <b>' + len(r.height) + '</b> off the floor at the ' + e + ' edge.</li>';
    if (r.through != null) {
      h += '<li>Going through the ' + len(r.thick) + ' seat takes <b>' + len(r.through) + '</b> of leg.</li>';
    }
    if (r.rough != null) {
      // Sawing the tenon flush with the seat and the foot flush with the floor.
      var cuts = [];
      if (r.trimTenon > 1e-9) cuts.push('<b>' + lenUp(r.trimTenon) + '</b> off the ' + len(r.tenonDia) + ' tenon');
      if (r.trimFoot > 1e-9) cuts.push('<b>' + lenUp(r.trimFoot) + '</b> off the ' + len(r.footDia) + ' foot');
      if (cuts.length) {
        h += '<li>Cutting flush takes at least ' + cuts.join(' and ') + (r.roughThrough == null
          ? ', so start with a leg at least <b>' + lenUp(r.rough) + '</b> long.'
          : '. Start with a leg at least <b>' + lenUp(r.rough) + '</b> long with the mark on top of the seat, or <b>'
            + lenUp(r.roughThrough) + '</b> with it underneath.') + '</li>';
      }
    }
    h += '</ul><div class="pics">'
      + '<figure>' + planSvg(leg, r) + '<figcaption>From above, to scale</figcaption></figure>'
      + '<figure>' + sideSvg(leg, r) + '<figcaption>' + (tilt ? 'Square to the leg (the tilt is not drawn)' : 'Square to the sightline')
      + '</figcaption></figure></div>';
    return h;
  }

  // ------------------------------------------------------------------ page --

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = true;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function seg(name, options, current, prop) {
    var box = el('div', { class: 'seg', role: 'radiogroup' });
    options.forEach(function (o) {
      var id = name + '-' + o[0];
      box.appendChild(el('input', { type: 'radio', name: name, id: id, value: o[0], checked: o[0] === current, 'data-set': prop }));
      box.appendChild(el('label', { for: id, text: o[1] }));
    });
    return box;
  }

  function choice(label, control) {
    return el('div', { class: 'choice' }, [el('span', { text: label }), control]);
  }

  // A typing box, or the same box worked out for you.
  function control(leg, key, label, placeholder) {
    var id = leg.id + '-' + key;
    if (!isInput(leg, key)) return el('output', { id: id, 'data-out': key, text: '—', 'aria-label': label, title: label });
    return el('input', {
      type: 'text', id: id, value: leg[key], 'data-key': key, autocomplete: 'off', spellcheck: 'false',
      placeholder: placeholder, 'aria-label': label, title: label,
    });
  }

  function field(leg, key, label) {
    var isLen = LENGTH_KEYS.indexOf(key) >= 0;
    var c = control(leg, key, label, isLen ? unitWord() : '°');
    c.removeAttribute('aria-label');
    c.removeAttribute('title');
    return el('div', { class: 'field' }, [el('label', { for: leg.id + '-' + key, text: label }), c]);
  }

  // A box for a number the whole chair shares; every leg's card shows it.
  function chairField(leg, key, label, placeholder) {
    var id = leg.id + '-' + key;
    return el('div', { class: 'field' }, [
      el('label', { for: id, text: label }),
      el('input', {
        type: 'text', id: id, value: chair()[key], 'data-chair-key': key, autocomplete: 'off', spellcheck: 'false', placeholder: placeholder,
      }),
    ]);
  }

  function group(title, note, kids) {
    var legend = el('legend', { text: title });
    if (note) legend.appendChild(el('span', { class: 'tag', text: note }));
    return el('fieldset', {}, [legend].concat(kids));
  }

  // The seat from above with the typing boxes on it. Not to scale: the boxes
  // stay put while you type. Laid out on a 400 x 276 sheet; across is a
  // percentage of the width, down is pixels, and a back leg is the same sheet
  // turned top to bottom so its edge is at the top.
  var SHEET = { w: 400, h: 276, x0: 26, x1: 392, y0: 12, y1: 248, mx: 252, my: 84, fx: 132, fy: 200 };

  function birdsEye(leg) {
    var S = SHEET;
    var back = leg.end === 'back';
    var e = endWord(leg);
    var yy = function (v) { return back ? S.h - v : v; };
    var pct = function (x) { return (x / S.w * 100).toFixed(2) + '%'; };
    var ns = ' vector-effect="non-scaling-stroke"';
    var p = [];
    p.push('<rect x="' + S.x0 + '" y="' + Math.min(yy(S.y0), yy(S.y1)) + '" width="' + (S.x1 - S.x0) + '" height="' + (S.y1 - S.y0)
      + '" fill="' + COLORS.ground + '" stroke="' + COLORS.rule + '" stroke-width="1"' + ns + '/>');
    p.push(line(S.x0, yy(S.my), S.mx, yy(S.my), COLORS.muted, 1, null, ns));
    p.push(line(S.mx, yy(S.my), S.mx, yy(S.y1), COLORS.muted, 1, null, ns));
    p.push(line(S.x0, yy(S.fy), S.fx, yy(S.fy), COLORS.muted, 1, null, ns));
    p.push(line(S.fx, yy(S.fy), S.fx, yy(S.y1), COLORS.muted, 1, null, ns));
    p.push(line(S.mx, yy(S.my), S.fx, yy(S.fy), COLORS.rust, 2, '6 5', ns));
    p.push(line(S.x0, yy(S.y0), S.x0, yy(S.y1), COLORS.ink, 2.5, null, ns));
    p.push(line(S.x0, yy(S.y1), S.x1, yy(S.y1), COLORS.ink, 2.5, null, ns));
    var box = el('div', { class: 'plan' + (back ? ' back' : '') });
    box.innerHTML = '<svg viewBox="0 0 ' + S.w + ' ' + S.h + '" preserveAspectRatio="none" aria-hidden="true">' + p.join('') + '</svg>';

    var put = function (node, left, top) {
      node.style.left = left;
      node.style.top = top + 'px';
      box.appendChild(node);
      return node;
    };
    put(el('span', { class: 'tag side', text: 'side edge' }), '11px', yy((S.y0 + S.y1) / 2));
    put(el('span', { class: 'tag mid', text: e + ' edge' }), pct((S.x0 + S.x1) / 2), yy(S.y1 + 14));
    put(el('span', { class: 'tag', text: 'mortise' }), 'calc(' + pct(S.mx) + ' + 13px)', yy(S.my) - 22);
    put(el('span', { class: 'tag end', text: 'foot' }), 'calc(' + pct(S.fx) + ' - 7px)', yy(S.fy + 36) - 8);
    put(el('span', { class: 'pt mortise' }), pct(S.mx), yy(S.my));
    put(el('span', { class: 'pt foot' }), pct(S.fx), yy(S.fy));

    var u = unitWord();
    put(el('div', { class: 'pbox' }, [control(leg, 'mSide', 'Mortise, in from the side edge', '↔ ' + u)]),
      pct((S.x0 + S.mx) / 2), yy(S.my));
    put(el('div', { class: 'pbox' }, [control(leg, 'mEnd', 'Mortise, in from the ' + e + ' edge', '↕ ' + u)]),
      pct(S.mx), yy((S.my + S.y1) / 2));
    put(el('div', { class: 'pbox' }, [control(leg, 'fSide', 'Foot, from the side edge', '↔ ' + u)]),
      pct((S.x0 + S.fx) / 2), yy(S.fy));
    put(el('div', { class: 'pbox left' }, [control(leg, 'fEnd', 'Foot, from the ' + e + ' edge', '↕ ' + u)]),
      'calc(' + pct(S.fx) + ' + 10px)', yy((S.fy + S.y1) / 2));
    return box;
  }

  function buildCard(leg) {
    var e = endWord(leg);
    var card = el('section', { class: 'card', 'data-id': leg.id });
    var endPick = el('select', { 'data-set': 'end', 'aria-label': 'Which edge this leg is measured from' }, [
      el('option', { value: 'front', text: 'measured from the front edge' }),
      el('option', { value: 'back', text: 'measured from the back edge' }),
    ]);
    endPick.value = e;
    card.appendChild(el('div', { class: 'card-head' }, [
      el('input', { type: 'text', class: 'leg-name', value: leg.name, placeholder: 'Name this leg', 'aria-label': 'Leg name', 'data-key': 'name' }),
      endPick,
      el('button', { class: 'btn', type: 'button', 'data-act': 'dup', text: 'Duplicate' }),
      el('button', { class: 'btn quiet', type: 'button', 'data-act': 'remove', text: 'Remove' }),
    ]));
    card.appendChild(choice('Work out', seg(leg.id + '-find', [
      ['angle', 'the angles'], ['foot', 'where the foot lands'], ['mortise', 'where the mortise goes'],
    ], leg.find, 'find')));

    var form = el('div', { class: 'form' });
    var planKids = [birdsEye(leg)];
    if (leg.find !== 'foot') {
      planKids.push(el('div', { class: 'inline' }, [
        el('button', { class: 'btn', type: 'button', 'data-act': 'corner', text: 'Put the foot under the corner' }),
      ]));
    }
    planKids.push(el('p', {
      class: 'hint',
      text: 'Each box is the distance along its line, from the edge to the point. For the foot, 0 is straight under the edge and a minus number is out past it.',
    }));
    var note = leg.find === 'foot' ? 'the foot is worked out for you' : leg.find === 'mortise' ? 'the mortise is worked out for you' : null;
    form.appendChild(group('The seat from above', note, planKids));

    form.appendChild(group('Height', null, [
      choice('I know the', seg(leg.id + '-known', [['height', 'height'], ['length', 'leg length']], leg.known, 'known')),
      el('div', { class: 'fields' }, [
        field(leg, 'height', 'Height, floor to the seat at the ' + e + ' edge'),
        field(leg, 'length', 'Leg length, mortise mark to floor'),
        chairField(leg, 'tilt', 'Seat tilt (optional, whole chair)', '°'),
        field(leg, 'thick', 'Seat thickness (optional)'),
      ]),
      el('p', { class: 'hint', text: 'Tilt is how many degrees the seat drops toward the back. Leave it empty for a level seat.' }),
    ]));

    var angleKids = [];
    if (leg.find !== 'angle') {
      angleKids.push(choice('I know the', seg(leg.id + '-pair', [['sr', 'resultant and sightline'], ['rs', 'rake and splay']], leg.pair, 'pair')));
    }
    angleKids.push(el('div', { class: 'fields' }, [
      field(leg, 'result', 'Resultant'), field(leg, 'sight', 'Sightline'),
      field(leg, 'rake', 'Rake (seen from the side)'), field(leg, 'splay', 'Splay (seen from the front)'),
    ]));
    if (leg.find !== 'angle') {
      angleKids.push(el('p', {
        class: 'hint',
        text: leg.pair === 'sr'
          ? 'This takes the foot to kick out toward both edges. For a leg that leans the other way, use rake and splay.'
          : 'A plus number leans the foot out toward the edge. A minus number leans it the other way.',
      }));
    }
    form.appendChild(group('Angles', leg.find === 'angle' ? 'worked out for you' : null, angleKids));

    form.appendChild(group('Cutting flush', null, [
      el('div', { class: 'fields' }, [
        chairField(leg, 'tenonDia', 'Tenon diameter (whole chair)', len(flushDefault('tenonDia'))),
        chairField(leg, 'footDia', 'Foot diameter (whole chair)', len(flushDefault('footDia'))),
      ]),
      el('p', {
        class: 'hint',
        text: 'How thick the tenon is where it comes out of the seat, and the leg where it meets the floor. A slanted end loses a little length when it is sawn flush. Empty boxes use '
          + len(flushDefault('tenonDia')) + ' and ' + len(flushDefault('footDia')) + '.',
      }),
    ]));

    card.appendChild(el('div', { class: 'card-body' }, [form, el('div', { class: 'answer', 'aria-live': 'polite' })]));
    refreshCard(card, leg);
    return card;
  }

  function refreshCard(card, leg) {
    var r = solve(leg);
    Array.prototype.forEach.call(card.querySelectorAll('output[data-out]'), function (o) {
      o.textContent = shown(o.getAttribute('data-out'), r);
    });
    var bad = r.unreadable || [];
    var mark = function (input, key) {
      var isBad = bad.indexOf(key) >= 0;
      input.classList.toggle('bad', isBad);
      if (isBad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (i) { mark(i, i.getAttribute('data-key')); });
    Array.prototype.forEach.call(card.querySelectorAll('input[data-chair-key]'), function (i) { mark(i, i.getAttribute('data-chair-key')); });
    card.querySelector('.answer').innerHTML = answerHtml(leg, r);
  }

  // ------------------------------------------------------------ stretchers --

  // Leg names are typed by the person, so they are made safe before they go
  // into a sentence that is set as HTML.
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function legLabel(leg) { return leg.name || 'Leg ' + (chair().legs.indexOf(leg) + 1); }

  function stretcherById(id) {
    var list = chair().stretchers;
    for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
  }

  // A new stretcher starts on a pair of legs that has none yet: front to back
  // along a side first, then each pair of legs side to side.
  function newStretcher() {
    var legs = chair().legs;
    var tag = function (a, b, across) { return a + '|' + b + '|' + (across ? 1 : 0); };
    var used = {};
    chair().stretchers.forEach(function (s) { used[tag(s.from, s.to, s.across)] = true; });
    var tries = [];
    legs.forEach(function (a) {
      legs.forEach(function (b) { if (a.end === 'front' && b.end === 'back') tries.push([a, b, false]); });
    });
    legs.forEach(function (a) { tries.push([a, a, true]); });
    var found = null;
    tries.forEach(function (t) { if (!found && !used[tag(t[0].id, t[1].id, t[2])]) found = t; });
    if (!found) found = tries[0] || null;
    return {
      id: uid(), name: '', from: found ? found[0].id : '', to: found ? found[1].id : '', across: found ? found[2] : true,
      height: '', legDia: '',
    };
  }

  // The two legs a stretcher runs between, or null while one is not picked.
  function stretcherLegs(st) {
    var a = legById(st.from), b = legById(st.to);
    return a && b ? { a: a, b: b, across: st.across || a === b } : null;
  }

  function autoName(st) {
    var pair = stretcherLegs(st);
    if (!pair) return 'Stretcher';
    if (pair.a === pair.b) return legLabel(pair.a) + ', side to side';
    return legLabel(pair.a) + ' to ' + legLabel(pair.b) + (pair.across ? ', corner to corner' : '');
  }

  function stretchDefault(key) { return STRETCH_DEFAULT[state.units === 'mm' ? 'mm' : 'in'][key]; }
  function typedOrUsual(typed, key) {
    var v = M.parseLength(typed, state.units);
    return v == null ? stretchDefault(key) : v;
  }

  function solveStretcher(st) {
    var pair = stretcherLegs(st);
    if (!pair) return { ok: false, pick: true };
    var ra = solve(pair.a);
    var rb = pair.b === pair.a ? ra : solve(pair.b);
    var unsolved = [];
    if (!ra.ok) unsolved.push(pair.a);
    if (!rb.ok && pair.b !== pair.a) unsolved.push(pair.b);
    if (unsolved.length) return { ok: false, unsolved: unsolved };
    ra.end = pair.a.end;
    rb.end = pair.b.end;
    return M.solveStretcher({
      a: ra, b: rb, across: pair.across,
      width: M.parseLength(chair().width, state.units),
      depth: M.parseLength(chair().depth, state.units),
      height: M.parseLength(st.height, state.units),
      stretcherDia: typedOrUsual(chair().stretcherDia, 'stretcherDia'),
      legDia: typedOrUsual(st.legDia, 'legDia'),
    });
  }

  var STRETCH_WORDS = {
    height: 'the height off the floor', width: 'the seat width', depth: 'the seat depth',
    stretcherDia: 'the stretcher tenon diameter', legDia: 'the leg thickness',
  };

  // Why a stretcher has no answer yet, in plain words.
  function explainStretcher(r) {
    var words = function (keys) { return listWords(keys.map(function (k) { return STRETCH_WORDS[k]; })); };
    if (r.pick) return { problem: false, text: 'Pick the two legs this stretcher runs between.' };
    if (r.unsolved) {
      return {
        problem: false,
        text: 'Finish ' + listWords(r.unsolved.map(function (l) { return esc(legLabel(l)); }))
          + ' above first. A stretcher needs both of its legs worked out.',
      };
    }
    if (r.unreadable) {
      return { problem: true, text: 'Cannot read ' + words(r.unreadable) + '. Lengths read like ' + (state.units === 'mm' ? '432 or 431.8' : '17 1/2 or 17.5') + '.' };
    }
    if (r.missing) return { problem: false, text: 'Still needed: ' + words(r.missing) + '.' };
    var msgs = {
      'stretcher-low': 'The height off the floor has to be more than zero.',
      'stretcher-high': 'That is as high as the seat. At these legs the mortise is ' + (r.limit != null ? len(r.limit) : 'so far')
        + ' off the floor, so the stretcher has to be lower than that.',
      'dia-zero': 'The tenon diameter and the leg thickness have to be more than zero.',
      'tenon-fat': 'The tenon is thicker than the leg it goes through.',
      'width-small': 'That seat is too narrow for these two mortises. Check the seat width: it runs from one side edge to the other.',
      'depth-small': 'That seat is too shallow for these two mortises. Check the seat depth: it runs from the front edge to the back edge.',
      'legs-touch': 'At that height the two legs touch or cross, so there is no room for a stretcher.',
    };
    return { problem: true, text: msgs[r.error] || 'These numbers do not make a stretcher.' };
  }

  // To scale, looking square at the stretcher: the two legs as they lean in
  // that view, the seat at the mortise marks, the floor, and the stretcher
  // going right through both legs.
  function stretcherSvg(r) {
    var W = 300, HH = 250, padX = 20, padT = 30, padB = 30;
    var a = r.a, b = r.b;
    var lo = Math.min(a.footAt, a.topAt, b.footAt, b.topAt, -r.throughA);
    var hi = Math.max(a.footAt, a.topAt, b.footAt, b.topAt, r.between + r.throughB);
    var top = Math.max(a.topHeight, b.topHeight);
    var s = Math.min((W - 2 * padX) / (hi - lo), (HH - padT - padB) / top);
    var x0 = (W - (hi - lo) * s) / 2;
    var X = function (v) { return x0 + (v - lo) * s; };
    var Y = function (z) { return HH - padB - z * s; };
    var ys = Y(r.height);
    var thick = Math.max(3, r.stretcherDia * s);
    var p = [];
    p.push(line(8, Y(0), W - 8, Y(0), COLORS.ink, 1.5));
    p.push(text(W - 8, Y(0) + 16, 'floor', 'end', 'lbl-muted'));
    var sx1 = X(a.topAt), sy1 = Y(a.topHeight), sx2 = X(b.topAt), sy2 = Y(b.topHeight);
    var sl = Math.hypot(sx2 - sx1, sy2 - sy1) || 1, ex = (sx2 - sx1) / sl * 18, ey = (sy2 - sy1) / sl * 18;
    p.push(line(sx1 - ex, sy1 - ey, sx2 + ex, sy2 + ey, COLORS.ink, 3));
    p.push(text(Math.min(sx1 - ex, sx2 + ex), Math.min(sy1 - ey, sy2 + ey) - 8, 'seat', 'start', 'lbl-muted'));
    [a, b].forEach(function (leg) {
      // A leaning stick sawn level is wider across the cut than it is thick.
      var lean = Math.atan2(leg.topAt - leg.footAt, leg.topHeight);
      var w = Math.max(3, r.legDia * s / Math.cos(lean)) / 2;
      p.push('<polygon points="' + [X(leg.footAt) - w, Y(0), X(leg.footAt) + w, Y(0), X(leg.topAt) + w, Y(leg.topHeight), X(leg.topAt) - w, Y(leg.topHeight)]
        .map(f1).join(' ') + '" fill="' + COLORS.rust + '" fill-opacity="0.28" stroke="' + COLORS.rust + '" stroke-width="1.2" stroke-linejoin="round"/>');
    });
    p.push('<rect x="' + f1(X(-r.throughA)) + '" y="' + f1(ys - thick / 2) + '" width="' + f1((r.between + r.throughA + r.throughB) * s)
      + '" height="' + f1(thick) + '" rx="1" fill="' + COLORS.blue + '"/>');
    // Two numbers only, so a tall narrow stool stays readable: the shortest
    // stretcher above it, and its height beside a plumb line to the floor.
    var mid = (X(0) + X(r.between)) / 2;
    p.push(text(mid, ys - thick / 2 - 7, 'at least ' + lenUp(r.length), 'middle', 'num'));
    var below = Y(0) - ys - thick / 2;
    if (below > 6) p.push(line(mid, ys + thick / 2 + 2, mid, Y(0), COLORS.muted, 1, '4 4'));
    p.push(text(mid + 6, below > 22 ? ys + thick / 2 + below / 2 + 4 : Y(0) + 16, len(r.height), 'start', 'num'));
    return '<svg viewBox="0 0 ' + W + ' ' + HH + '" role="img" aria-label="The stretcher from the side, to scale: the two legs, the stretcher through both, and its height off the floor">'
      + p.join('') + '</svg>';
  }

  function stretcherAnswerHtml(st, r) {
    if (!r.ok) {
      var why = explainStretcher(r);
      return '<p class="waiting' + (why.problem ? ' problem' : '') + '">' + why.text + '</p>';
    }
    var pair = stretcherLegs(st);
    var twin = pair.a === pair.b;
    var na = esc(legLabel(pair.a)), nb = esc(legLabel(pair.b));
    var h = '<div class="stats lead">'
      + '<div class="stat"><b>' + lenUp(r.length) + '</b><span>stretcher, at least</span></div>'
      + '<div class="stat"><b>' + len(r.between) + '</b><span>between the leg centres</span></div>'
      + '<div class="stat"><b>' + len(r.gap) + '</b><span>between the legs, face to face</span></div>'
      + '</div><ul class="says">';
    h += '<li>The stretcher has to be at least <b>' + lenUp(r.length) + '</b> long to go right through both legs. That only just reaches the far side, so leave more.</li>';
    var ta = lenUp(r.throughA), tb = lenUp(r.throughB);
    h += '<li>Going through takes at least ' + (twin || ta === tb ? '<b>' + ta + '</b> past the centre of each leg'
      : '<b>' + ta + '</b> past the centre of ' + na + ' and <b>' + tb + '</b> past the centre of ' + nb) + '.</li>';
    var oa = M.formatAngle(r.offSquareA), ob = M.formatAngle(r.offSquareB);
    if (oa === '0.0°' && ob === '0.0°') h += '<li>It goes through the legs square.</li>';
    else if (twin || oa === ob) h += '<li>It goes through each leg <b>' + oa + '</b> off square.</li>';
    else h += '<li>It goes through ' + na + ' <b>' + oa + '</b> off square, and ' + nb + ' <b>' + ob + '</b> off square.</li>';
    h += '<li>Worked out for a ' + len(r.stretcherDia) + ' tenon through legs ' + len(r.legDia) + ' thick where the stretcher crosses.</li>';
    h += '</ul><div class="pics"><figure>' + stretcherSvg(r) + '<figcaption>Square to the stretcher, to scale</figcaption></figure></div>';
    return h;
  }

  // A typing box on a stretcher's card: its own number, or one the chair shares.
  function stretchBox(st, key, label, placeholder, whole) {
    var id = st.id + '-' + key;
    var attrs = { type: 'text', id: id, value: whole ? chair()[key] : st[key], autocomplete: 'off', spellcheck: 'false', placeholder: placeholder };
    attrs[whole ? 'data-chair-key' : 'data-skey'] = key;
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), el('input', attrs)]);
  }

  function buildStretcherCard(st) {
    var legs = chair().legs;
    var pair = stretcherLegs(st);
    var a = legById(st.from), b = legById(st.to);
    var card = el('section', { class: 'card', 'data-id': st.id });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('input', { type: 'text', class: 'leg-name', value: st.name, placeholder: autoName(st), 'aria-label': 'Stretcher name', 'data-skey': 'name' }),
      el('button', { class: 'btn quiet', type: 'button', 'data-act': 'remove', text: 'Remove' }),
    ]));

    var fromPick = el('select', { 'data-sset': 'from', 'aria-label': 'The first leg' },
      (a ? [] : [el('option', { value: '', text: 'pick a leg' })]).concat(legs.map(function (l) {
        return el('option', { value: l.id, text: legLabel(l) });
      })));
    fromPick.value = a ? a.id : '';
    var toOptions = b ? [] : [el('option', { value: '', text: 'pick a leg' })];
    legs.forEach(function (l) {
      if (l !== a) toOptions.push(el('option', { value: l.id + '|same', text: legLabel(l) + ', same side' }));
      toOptions.push(el('option', { value: l.id + '|other', text: legLabel(l) + ', other side' }));
    });
    var toPick = el('select', { 'data-sset': 'to', 'aria-label': 'The second leg' }, toOptions);
    toPick.value = pair ? pair.b.id + '|' + (pair.across ? 'other' : 'same') : '';

    var boxes = [
      stretchBox(st, 'height', 'Height off the floor, to the centre of the stretcher', unitWord()),
      stretchBox(st, 'legDia', 'Leg thickness where it goes through', len(stretchDefault('legDia'))),
    ];
    if (pair && pair.across) boxes.push(stretchBox(st, 'width', 'Seat width, side edge to side edge (whole chair)', unitWord(), true));
    if (pair && pair.a.end !== pair.b.end) boxes.push(stretchBox(st, 'depth', 'Seat depth, front edge to back edge (whole chair)', unitWord(), true));
    boxes.push(stretchBox(st, 'stretcherDia', 'Stretcher tenon diameter (whole chair)', len(stretchDefault('stretcherDia')), true));

    var form = el('div', { class: 'form' }, [group('Where it goes', null, [
      el('div', { class: 'choice between' }, [el('span', { text: 'Between' }), fromPick, el('span', { text: 'and' }), toPick]),
      el('div', { class: 'fields' }, boxes),
      el('p', {
        class: 'hint',
        text: 'The stretcher runs level, with its centre at that height on both legs. Measure the leg where the stretcher crosses it. Empty boxes use a leg '
          + len(stretchDefault('legDia')) + ' thick and a ' + len(stretchDefault('stretcherDia')) + ' tenon.',
      }),
    ])]);
    card.appendChild(el('div', { class: 'card-body' }, [form, el('div', { class: 'answer', 'aria-live': 'polite' })]));
    refreshStretcherCard(card, st);
    return card;
  }

  function refreshStretcherCard(card, st) {
    var r = solveStretcher(st);
    var bad = r.unreadable || [];
    Array.prototype.forEach.call(card.querySelectorAll('input[data-skey], input[data-chair-key]'), function (i) {
      var isBad = bad.indexOf(i.getAttribute('data-skey') || i.getAttribute('data-chair-key')) >= 0;
      i.classList.toggle('bad', isBad);
      if (isBad) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    });
    card.querySelector('.answer').innerHTML = stretcherAnswerHtml(st, r);
  }

  // Every stretcher's card, built again. The legs' names and numbers feed
  // them, so this runs whenever a leg changes.
  function renderStretchers() {
    var box = document.getElementById('stretchers');
    box.textContent = '';
    chair().stretchers.forEach(function (st) { box.appendChild(buildStretcherCard(st)); });
  }

  var STRETCH_HEAD = ['Stretcher', 'Height off the floor', 'Between the leg centres', 'Between the legs, face to face',
    'Leg thickness there', 'Off square to the legs', 'Stretcher at least'];

  function stretcherRows() {
    return chair().stretchers.map(function (st) {
      var r = solveStretcher(st);
      var name = st.name ? st.name + ' (' + autoName(st) + ')' : autoName(st);
      if (!r.ok) return { name: name, cells: null };
      var oa = M.formatAngle(r.offSquareA), ob = M.formatAngle(r.offSquareB);
      return { name: name, cells: [len(r.height), len(r.between), len(r.gap), len(r.legDia), oa === ob ? oa : oa + ' and ' + ob, lenUp(r.length)] };
    });
  }

  function stretcherLine() {
    var t = typedOrUsual(chair().stretcherDia, 'stretcherDia');
    return 'Each stretcher length is the least that goes right through both legs'
      + (isNaN(t) || !(t > 0) ? '.' : ', for a ' + len(t) + ' tenon.');
  }

  var SUMMARY_HEAD = ['Leg', 'Mortise from side', 'Mortise from front or back', 'Foot from side', 'Foot from front or back',
    'Height at that edge', 'Resultant', 'Sightline', 'Rake', 'Splay', 'Leg length', 'Leg plus flush cuts'];
  // The front-or-back columns say which, per leg.
  var END_COLUMNS = [1, 3];

  function summaryRows() {
    return chair().legs.map(function (leg) {
      var r = solve(leg);
      var name = leg.name || 'Leg';
      if (!r.ok) return { name: name, end: endWord(leg), cells: null };
      return {
        name: name,
        end: endWord(leg),
        cells: [len(r.mSide), len(r.mEnd), len(r.fSide), len(r.fEnd), len(r.height),
          M.formatAngle(r.result), r.plumb ? '—' : M.formatAngle(r.sight), M.formatAngle(r.rake), M.formatAngle(r.splay), len(r.length), lenUp(r.rough)],
      };
    });
  }

  function tiltLine() {
    var t = M.parseAngle(chair().tilt);
    if (typeof t !== 'number' || isNaN(t) || Math.abs(t) < 1e-9) return 'Level seat. Angles are read against the seat.';
    return 'Seat tilt ' + M.formatAngle(t) + ', dropping toward the back. Angles are read against the seat.';
  }

  function flushLine() {
    var t = flushSize('tenonDia');
    var f = flushSize('footDia');
    if (isNaN(t) || isNaN(f) || t < 0 || f < 0) return '';
    return 'Flush cuts are worked out for a ' + len(t) + ' tenon and a ' + len(f) + ' foot.';
  }

  function refreshSummary() {
    var table = document.getElementById('summary-table');
    table.textContent = '';
    table.appendChild(el('tr', {}, SUMMARY_HEAD.map(function (hd) { return el('th', { text: hd, scope: 'col' }); })));
    summaryRows().forEach(function (row) {
      var tr = el('tr', {}, [el('td', { text: row.name })]);
      if (row.cells) {
        row.cells.forEach(function (c, i) {
          var shownText = END_COLUMNS.indexOf(i) >= 0 ? c + ' (' + row.end + ')' : c;
          tr.appendChild(el('td', { text: shownText, class: i >= 5 ? 'num' : null }));
        });
      } else {
        tr.appendChild(el('td', { text: 'not worked out yet', colspan: String(SUMMARY_HEAD.length - 1) }));
      }
      table.appendChild(tr);
    });
    document.getElementById('summary-note').textContent = (tiltLine() + ' ' + flushLine()).trim();

    // The stretchers get a table of their own under the legs, when there are any.
    var rows = stretcherRows();
    document.getElementById('stretcher-summary').hidden = !rows.length;
    var sTable = document.getElementById('stretcher-table');
    sTable.textContent = '';
    if (!rows.length) return;
    sTable.appendChild(el('tr', {}, STRETCH_HEAD.map(function (hd) { return el('th', { text: hd, scope: 'col' }); })));
    rows.forEach(function (row) {
      var tr = el('tr', {}, [el('td', { text: row.name })]);
      if (row.cells) row.cells.forEach(function (c, i) { tr.appendChild(el('td', { text: c, class: i >= 4 ? 'num' : null })); });
      else tr.appendChild(el('td', { text: 'not worked out yet', colspan: String(STRETCH_HEAD.length - 1) }));
      sTable.appendChild(tr);
    });
    document.getElementById('stretcher-note').textContent = stretcherLine();
  }

  // After a leg changes: the stretchers that hang on it, then the tables.
  function refreshRest() {
    renderStretchers();
    refreshSummary();
  }

  function summaryText() {
    var lines = [chair().name || 'Leg calculator', tiltLine()];
    if (flushLine()) lines.push(flushLine());
    summaryRows().forEach(function (row) {
      if (!row.cells) { lines.push(row.name + ': not worked out yet'); return; }
      var c = row.cells;
      lines.push(row.name + ': mortise ' + c[0] + ' from the side, ' + c[1] + ' from the ' + row.end + '; foot ' + c[2]
        + ' from the side, ' + c[3] + ' from the ' + row.end + '; height ' + c[4] + ' at the ' + row.end + ' edge; resultant ' + c[5]
        + ', sightline ' + c[6] + ', rake ' + c[7] + ', splay ' + c[8] + '; leg ' + c[9] + ' mark to floor, at least ' + c[10] + ' with the flush cuts.');
    });
    stretcherRows().forEach(function (row, i) {
      if (i === 0) lines.push(stretcherLine());
      if (!row.cells) { lines.push(row.name + ': not worked out yet'); return; }
      var s = row.cells;
      lines.push(row.name + ': ' + s[0] + ' off the floor; ' + s[1] + ' between the leg centres, ' + s[2] + ' between the legs face to face; through legs '
        + s[3] + ' thick, ' + s[4] + ' off square; at least ' + s[5] + ' end to end.');
    });
    return lines.join('\n');
  }

  function refreshChairBar() {
    document.getElementById('chair-name').value = chair().name;
    var sel = document.getElementById('chair-pick');
    sel.textContent = '';
    state.chairs.forEach(function (c, i) {
      sel.appendChild(el('option', { value: c.id, text: c.name || 'Untitled ' + (i + 1) }));
    });
    sel.value = chair().id;
    document.getElementById('units-' + state.units).checked = true;
  }

  function renderAll() {
    refreshChairBar();
    var legs = document.getElementById('legs');
    legs.textContent = '';
    chair().legs.forEach(function (leg) { legs.appendChild(buildCard(leg)); });
    refreshRest();
  }

  function rebuildCard(card, leg, focusSelector) {
    var fresh = buildCard(leg);
    card.parentNode.replaceChild(fresh, card);
    if (focusSelector) {
      var again = fresh.querySelector(focusSelector);
      if (again) again.focus();
    }
    return fresh;
  }

  // ---------------------------------------------------------------- events --

  var legsBox = document.getElementById('legs');

  function cardOf(target) {
    var n = target;
    while (n && n !== legsBox && !(n.classList && n.classList.contains('card'))) n = n.parentNode;
    return n && n !== legsBox ? n : null;
  }

  legsBox.addEventListener('input', function (ev) {
    if (!ev.target.getAttribute) return;
    var card = cardOf(ev.target);
    if (!card) return;
    var chairKey = ev.target.getAttribute('data-chair-key');
    if (CHAIR_KEYS.indexOf(chairKey) >= 0) {
      // One number for the whole chair: every leg's box shows it and every leg is worked again.
      chair()[chairKey] = ev.target.value;
      save();
      Array.prototype.forEach.call(legsBox.querySelectorAll('.card'), function (c) {
        var l = legById(c.getAttribute('data-id'));
        var box = c.querySelector('input[data-chair-key="' + chairKey + '"]');
        if (box && box !== ev.target) box.value = chair()[chairKey];
        if (l) refreshCard(c, l);
      });
      refreshRest();
      return;
    }
    var key = ev.target.getAttribute('data-key');
    var leg = legById(card.getAttribute('data-id'));
    if (!key || !leg) return;
    leg[key] = ev.target.value;
    save();
    if (key !== 'name') refreshCard(card, leg);
    refreshRest();
  });

  legsBox.addEventListener('change', function (ev) {
    var prop = ev.target.getAttribute && ev.target.getAttribute('data-set');
    var card = cardOf(ev.target);
    if (!prop || !card) return;
    var leg = legById(card.getAttribute('data-id'));
    if (!leg) return;
    if (prop === 'end') leg.end = ev.target.value === 'back' ? 'back' : 'front';
    else setChoice(leg, prop, ev.target.value);
    save();
    var selector = ev.target.tagName === 'SELECT' ? 'select[data-set="end"]' : 'input[data-set="' + prop + '"]:checked';
    rebuildCard(card, leg, selector);
    refreshRest();
  });

  legsBox.addEventListener('click', function (ev) {
    var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
    var card = cardOf(ev.target);
    if (!act || !card) return;
    var legs = chair().legs;
    var leg = legById(card.getAttribute('data-id'));
    if (!leg) return;
    if (act === 'corner') {
      leg.fSide = '0';
      leg.fEnd = '0';
      rebuildCard(card, leg, 'button[data-act="corner"]');
    } else if (act === 'dup') {
      var copy = JSON.parse(JSON.stringify(leg));
      copy.id = uid();
      copy.name = (leg.name || 'Leg') + ' copy';
      legs.splice(legs.indexOf(leg) + 1, 0, copy);
      card.parentNode.insertBefore(buildCard(copy), card.nextSibling);
    } else if (act === 'remove') {
      var typed = LENGTH_KEYS.concat(ANGLE_KEYS).some(function (k) { return String(leg[k]).trim() !== ''; });
      if (typed && !window.confirm('Remove "' + (leg.name || 'this leg') + '" and its numbers?')) return;
      legs.splice(legs.indexOf(leg), 1);
      card.parentNode.removeChild(card);
    }
    save();
    refreshRest();
  });

  document.getElementById('add-leg').addEventListener('click', function () {
    var leg = newLeg('Leg ' + (chair().legs.length + 1), 'front');
    chair().legs.push(leg);
    var card = buildCard(leg);
    legsBox.appendChild(card);
    save();
    refreshRest();
    card.querySelector('.leg-name').focus();
  });

  // The stretchers' own boxes. Typing in one works that stretcher again;
  // a number the whole chair shares works them all again.
  var stretchersBox = document.getElementById('stretchers');

  function stretcherCardOf(target) {
    var n = target;
    while (n && n !== stretchersBox && !(n.classList && n.classList.contains('card'))) n = n.parentNode;
    return n && n !== stretchersBox ? n : null;
  }

  stretchersBox.addEventListener('input', function (ev) {
    if (!ev.target.getAttribute) return;
    var card = stretcherCardOf(ev.target);
    if (!card) return;
    var chairKey = ev.target.getAttribute('data-chair-key');
    if (STRETCH_CHAIR_KEYS.indexOf(chairKey) >= 0) {
      chair()[chairKey] = ev.target.value;
      save();
      Array.prototype.forEach.call(stretchersBox.querySelectorAll('.card'), function (c) {
        var s = stretcherById(c.getAttribute('data-id'));
        var box = c.querySelector('input[data-chair-key="' + chairKey + '"]');
        if (box && box !== ev.target) box.value = chair()[chairKey];
        if (s) refreshStretcherCard(c, s);
      });
      refreshSummary();
      return;
    }
    var key = ev.target.getAttribute('data-skey');
    var st = stretcherById(card.getAttribute('data-id'));
    if (!key || !st) return;
    st[key] = ev.target.value;
    save();
    if (key !== 'name') refreshStretcherCard(card, st);
    refreshSummary();
  });

  stretchersBox.addEventListener('change', function (ev) {
    var prop = ev.target.getAttribute && ev.target.getAttribute('data-sset');
    var card = stretcherCardOf(ev.target);
    if (!prop || !card) return;
    var st = stretcherById(card.getAttribute('data-id'));
    if (!st) return;
    if (prop === 'from') {
      st.from = ev.target.value;
      if (st.to === st.from) st.across = true; // a leg and itself is the pair, side to side
    } else {
      var parts = ev.target.value.split('|');
      st.to = parts[0];
      st.across = parts[1] === 'other' || st.to === st.from;
    }
    save();
    var fresh = buildStretcherCard(st);
    card.parentNode.replaceChild(fresh, card);
    var again = fresh.querySelector('select[data-sset="' + prop + '"]');
    if (again) again.focus();
    refreshSummary();
  });

  stretchersBox.addEventListener('click', function (ev) {
    var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
    var card = stretcherCardOf(ev.target);
    if (act !== 'remove' || !card) return;
    var list = chair().stretchers;
    var st = stretcherById(card.getAttribute('data-id'));
    if (!st) return;
    var typed = [st.name, st.height, st.legDia].some(function (v) { return String(v).trim() !== ''; });
    if (typed && !window.confirm('Remove "' + (st.name || autoName(st)) + '" and its numbers?')) return;
    list.splice(list.indexOf(st), 1);
    card.parentNode.removeChild(card);
    save();
    refreshSummary();
  });

  document.getElementById('add-stretcher').addEventListener('click', function () {
    var st = newStretcher();
    chair().stretchers.push(st);
    var card = buildStretcherCard(st);
    stretchersBox.appendChild(card);
    save();
    refreshSummary();
    card.querySelector('input[data-skey="height"]').focus();
  });

  document.getElementById('chair-name').addEventListener('input', function (ev) {
    chair().name = ev.target.value;
    save();
    var opt = document.getElementById('chair-pick').selectedOptions[0];
    if (opt) opt.textContent = chair().name || 'Untitled ' + (state.chairs.indexOf(chair()) + 1);
  });

  document.getElementById('chair-pick').addEventListener('change', function (ev) {
    state.currentId = ev.target.value;
    save();
    renderAll();
  });

  document.getElementById('chair-new').addEventListener('click', function () {
    var c = newChair();
    state.chairs.push(c);
    state.currentId = c.id;
    save();
    renderAll();
    document.getElementById('chair-name').focus();
  });

  document.getElementById('chair-delete').addEventListener('click', function () {
    var c = chair();
    if (!window.confirm('Delete "' + (c.name || 'this one') + '" and all its legs? This cannot be undone.')) return;
    state.chairs.splice(state.chairs.indexOf(c), 1);
    if (!state.chairs.length) state.chairs.push(newChair());
    state.currentId = state.chairs[0].id;
    save();
    renderAll();
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="units"]'), function (radio) {
    radio.addEventListener('change', function () {
      var to = radio.value === 'mm' ? 'mm' : 'in';
      var from = state.units;
      if (to === from) return;
      var k = to === 'mm' ? M.MM_PER_IN : 1 / M.MM_PER_IN;
      state.chairs.forEach(function (c) {
        CHAIR_LENGTH_KEYS.concat(STRETCH_CHAIR_KEYS).forEach(function (key) {
          var v = M.parseLength(c[key], from);
          if (typeof v === 'number' && !isNaN(v)) c[key] = M.inputText(v * k, to);
        });
        c.stretchers.forEach(function (st) {
          STRETCH_KEYS.forEach(function (key) {
            var v = M.parseLength(st[key], from);
            if (typeof v === 'number' && !isNaN(v)) st[key] = M.inputText(v * k, to);
          });
        });
        c.legs.forEach(function (leg) {
          LENGTH_KEYS.forEach(function (key) {
            var v = M.parseLength(leg[key], from);
            if (typeof v === 'number' && !isNaN(v)) leg[key] = M.inputText(v * k, to);
          });
        });
      });
      state.units = to;
      save();
      renderAll();
    });
  });

  document.getElementById('copy').addEventListener('click', function () {
    var note = document.getElementById('copy-note');
    var body = summaryText();
    var done = function () { note.textContent = 'Copied.'; };
    var failed = function () { note.textContent = 'This browser would not copy. Select the table and copy it by hand.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(done, failed);
    else failed();
  });

  document.getElementById('print').addEventListener('click', function () { window.print(); });

  renderAll();
  save();
})();
