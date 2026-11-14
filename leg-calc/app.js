// app.js — the leg calculator's page. The arithmetic is in leg-math.js.
//
// One "chair" is a named list of legs and one seat tilt. Each leg is a
// bird's-eye drawing of the seat with typing boxes on it, where one group of
// numbers is worked out from the others:
//   find  'angle' | 'foot' | 'mortise'   which group is worked out
//   known 'height' | 'length'            which of the two is typed in
//   pair  'sr' | 'rs'                    which pair of angles is typed in
// Everything typed is kept as text, exactly as typed, and saved in this
// browser (localStorage). Nothing leaves the page.

(function () {
  'use strict';

  var M = window.LegMath;
  var STORE_KEY = 'leg-calculator.v1';
  var LENGTH_KEYS = ['mSide', 'mEnd', 'fSide', 'fEnd', 'height', 'length', 'thick'];
  var ANGLE_KEYS = ['result', 'sight', 'rake', 'splay'];
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
    return { id: uid(), name: '', tilt: '', legs: [newLeg('Front legs', 'front'), newLeg('Back legs', 'back')] };
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

  function solve(leg) {
    var q = { find: leg.find, known: leg.known, pair: leg.pair, end: leg.end, tilt: M.parseAngle(chair().tilt) };
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

    var tiltBox = el('input', {
      type: 'text', id: leg.id + '-tilt', value: chair().tilt, 'data-chair-key': 'tilt', autocomplete: 'off', spellcheck: 'false', placeholder: '°',
    });
    form.appendChild(group('Height', null, [
      choice('I know the', seg(leg.id + '-known', [['height', 'height'], ['length', 'leg length']], leg.known, 'known')),
      el('div', { class: 'fields' }, [
        field(leg, 'height', 'Height, floor to the seat at the ' + e + ' edge'),
        field(leg, 'length', 'Leg length, mortise mark to floor'),
        el('div', { class: 'field' }, [el('label', { for: leg.id + '-tilt', text: 'Seat tilt (optional, whole chair)' }), tiltBox]),
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

  var SUMMARY_HEAD = ['Leg', 'Mortise from side', 'Mortise from front or back', 'Foot from side', 'Foot from front or back',
    'Height at that edge', 'Resultant', 'Sightline', 'Rake', 'Splay', 'Leg length'];
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
          M.formatAngle(r.result), r.plumb ? '—' : M.formatAngle(r.sight), M.formatAngle(r.rake), M.formatAngle(r.splay), len(r.length)],
      };
    });
  }

  function tiltLine() {
    var t = M.parseAngle(chair().tilt);
    if (typeof t !== 'number' || isNaN(t) || Math.abs(t) < 1e-9) return 'Level seat. Angles are read against the seat.';
    return 'Seat tilt ' + M.formatAngle(t) + ', dropping toward the back. Angles are read against the seat.';
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
    document.getElementById('summary-note').textContent = tiltLine();
  }

  function summaryText() {
    var lines = [chair().name || 'Leg calculator', tiltLine()];
    summaryRows().forEach(function (row) {
      if (!row.cells) { lines.push(row.name + ': not worked out yet'); return; }
      var c = row.cells;
      lines.push(row.name + ': mortise ' + c[0] + ' from the side, ' + c[1] + ' from the ' + row.end + '; foot ' + c[2]
        + ' from the side, ' + c[3] + ' from the ' + row.end + '; height ' + c[4] + ' at the ' + row.end + ' edge; resultant ' + c[5]
        + ', sightline ' + c[6] + ', rake ' + c[7] + ', splay ' + c[8] + '; leg ' + c[9] + ' mark to floor.');
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
    refreshSummary();
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
    if (ev.target.getAttribute('data-chair-key') === 'tilt') {
      // One tilt for the whole chair: every leg's box shows it and every leg is worked again.
      chair().tilt = ev.target.value;
      save();
      Array.prototype.forEach.call(legsBox.querySelectorAll('.card'), function (c) {
        var l = legById(c.getAttribute('data-id'));
        var box = c.querySelector('input[data-chair-key="tilt"]');
        if (box && box !== ev.target) box.value = chair().tilt;
        if (l) refreshCard(c, l);
      });
      refreshSummary();
      return;
    }
    var key = ev.target.getAttribute('data-key');
    var leg = legById(card.getAttribute('data-id'));
    if (!key || !leg) return;
    leg[key] = ev.target.value;
    save();
    if (key !== 'name') refreshCard(card, leg);
    refreshSummary();
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
    refreshSummary();
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
    refreshSummary();
  });

  document.getElementById('add-leg').addEventListener('click', function () {
    var leg = newLeg('Leg ' + (chair().legs.length + 1), 'front');
    chair().legs.push(leg);
    var card = buildCard(leg);
    legsBox.appendChild(card);
    save();
    refreshSummary();
    card.querySelector('.leg-name').focus();
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
