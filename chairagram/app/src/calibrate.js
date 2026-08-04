// calibrate.js — step 2. Two-click scale + floor line on the elevations,
// paper-quad homography + rectified preview on the top view.
//
// UI module: all the math it uses comes from homography.js, solve.js and
// markercal.js.
//
// PHASE 3b: when a printed marker sheet was found in the photo, the same
// fields arrive PREFILLED. Prefilled is all it is — the points are ordinary
// draggable clicks, the number is an ordinary editable input, nothing is
// locked, and the manual path below is exactly the code it was in phase 2.
// If no sheet is found, or the fit is not trusted, this step behaves as if
// markercal.js did not exist.

import { Viewport, dot, dimensionLine, label, el, viewTabs } from './viewport.js';
import { rectifyPlan, paperDims, apply, invert } from './homography.js';
import { elevationCalibration, topCalibration } from './solve.js';
import { VIEW_LABEL } from './landmarks.js';
import { applyElevationPrefill, topPrefillCorners } from './markercal.js';

/** Target long side of the rectified canvas, in pixels. */
const RECT_LONG_SIDE = 1400;
/** Resolution divisor used while a corner handle is being dragged. */
const DRAG_DIVISOR = 3;

const state = {
  viewId: null,
  tool: null,
  pending: [],
  vp: null,
  quadBefore: null,
  /** pan/zoom per view, so a re-render does not throw away the user's framing */
  vpState: {},
};

const COACH = {
  front: [
    'Stand square to the front of the chair, 3–4 m back, and zoom in rather than stepping closer.',
    'Measure something wide and flat-on — the seat’s front edge is ideal. Two points 3 in apart multiply every later error by ten.',
  ],
  side: [
    'Shoot the side from the chair’s right if you can; either side works, the solver reads the direction from your clicks.',
    'Both scale points must sit in the same plane as the parts you will click — the chair’s own side, never the wall behind it.',
  ],
  top: [
    'Lay a sheet of paper flat on the seat, square to the seat’s front edge, then shoot straight down.',
    'Click the paper’s four corners in order around the sheet. Every top-view landmark is then clicked on the rectified image, so every click is already metric.',
  ],
};

export function renderCalibrate(app, root) {
  const views = ['front', 'side', 'top'].filter((v) => app.project.views[v].present);
  if (state.viewId === null || !views.includes(state.viewId)) state.viewId = views[0] || null;
  destroy();
  root.textContent = '';

  const h2 = el('h2', {}, 'Calibrate');
  const lede = el('p', { class: 'lede' },
    'Tell the app how big a pixel is, and where the floor is. Everything measured later rides on these clicks.');
  root.append(h2, lede);

  if (!views.length) {
    root.append(el('div', { class: 'note warn' }, 'Add a front and a side photo on the Photos step first.'));
    return;
  }

  root.append(viewTabs(views, state.viewId, VIEW_LABEL, (id) => {
    state.viewId = id;
    state.tool = null;
    state.pending = [];
    app.rerenderStep();
  }));

  const viewId = state.viewId;
  const image = app.images[viewId];

  const cols = el('div', { class: 'cols canvas' });
  const left = el('div', {});
  const right = el('div', {});
  cols.append(left, right);
  root.append(cols);

  const wrap = el('div', { class: 'viewport-wrap' });
  const canvas = el('canvas');
  wrap.append(canvas);
  left.append(wrap);
  if (viewId === 'top') left.append(rectifiedPreview(app));

  const coach = el('div', { class: 'panel' });
  coach.append(el('h3', {}, 'How to shoot this view'));
  for (const line of COACH[viewId]) coach.append(el('p', { class: 'hint strong' }, line));
  right.append(coach);

  if (viewId === 'top') right.append(topTools(app));
  else right.append(elevationTools(app, viewId));

  if (!image) {
    wrap.append(el('div', { class: 'vp-empty' }, 'No photo attached for this view.'));
    return;
  }

  state.vp = new Viewport(canvas, viewId === 'top' ? topHandlers(app) : elevationHandlers(app, viewId));
  state.vp.setImage(image.bitmap, image.width, image.height);
  state.vp.restoreState(state.vpState[viewId]);
  if (viewId === 'top') scheduleWarp(app, false);
}

export function destroy() {
  if (state.vp) {
    if (state.viewId) state.vpState[state.viewId] = state.vp.saveState();
    state.vp.destroy();
    state.vp = null;
  }
}

// ---------------------------------------------------------------------------
// Elevations
// ---------------------------------------------------------------------------

/**
 * The quiet note about where this view's calibration came from.
 *
 * Quiet is the point: a prefill that shouts looks like a result, and this is
 * a starting position. Returns null when no detection has ever run on this
 * photo (`reason` is what distinguishes "ran, found nothing" from "never ran").
 */
function markerNote(app, viewId, onApply) {
  const mc = app.project.views[viewId].markerCal;
  if (!mc || (mc.status === 'none' && !mc.reason)) return null;
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Printed sheet'));

  if (mc.status === 'used') {
    const detail = `${mc.found} of 4 tags · fit ${fmtMm(mc.residualMm)} mm · `
      + `${mc.scalePxPerMm ? mc.scalePxPerMm.toFixed(2) : '—'} px per mm at the sheet's SEAT FRONT line`;
    panel.append(el('p', { class: 'hint strong' },
      viewId === 'top'
        ? 'The paper corners below were read from the printed sheet on the seat.'
        : 'The scale and the floor line below were read from the printed sheet on the floor.'));
    panel.append(el('p', { class: 'hint mono' }, detail));
    if (viewId !== 'top') {
      panel.append(el('p', { class: 'hint' },
        'It measures the sheet where the SEAT FRONT line sits, and then assumes your camera was '
        + 'level and square to the front of the chair. Shot from well above chair height, heights '
        + 'read a little small — re-click the two points on something you measured if that worries you.'));
    }
    panel.append(el('p', { class: 'hint' },
      'Nothing here is locked: drag the points, retype the number, or re-click either tool.'));
  } else if (mc.status === 'rejected') {
    panel.append(el('div', { class: 'note warn' },
      `A printed sheet is in this photo but the app will not calibrate from it — ${mc.reason}.`));
    panel.append(el('p', { class: 'hint mono' },
      `${mc.found} of 4 tags · fit ${fmtMm(mc.residualMm)} mm · `
      + `scale spread ${fmtPct(mc.jkScalePct)} · point spread ${fmtPx(mc.jkPointPx)} px `
      + 'at detection size'));
    panel.append(el('p', { class: 'hint' },
      'Usually the chair or a shadow is covering part of the sheet. Calibrate by hand below — '
      + 'or re-shoot with all four corner tags visible and try again.'));
  } else {
    panel.append(el('p', { class: 'hint' },
      'No printed sheet found in this photo, so this view is calibrated by hand. '
      + 'The sheet is optional — it only saves clicks.'));
  }

  if (onApply && (mc.status === 'used')) {
    const b = el('button', { class: 'tiny' },
      viewId === 'top' ? 'Re-read the corners from the sheet' : 'Re-read the scale from the sheet');
    b.onclick = onApply;
    panel.append(el('div', { class: 'row', style: 'margin-top:8px' }, b));
  }
  return panel;
}

function elevationTools(app, viewId) {
  const view = app.project.views[viewId];
  const cal = elevationCalibration(view, app.project.units);
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Scale reference'));

  const s = view.calib.scale;
  const step = el('div', { class: 'row' });
  const btn = el('button', { class: state.tool === 'scale' ? 'primary' : '' },
    s.a && s.b ? 'Re-click the two points' : 'Click two points…');
  btn.onclick = () => {
    state.tool = state.tool === 'scale' ? null : 'scale';
    state.pending = [];
    app.rerenderStep();
  };
  step.append(btn);
  panel.append(step);

  if (state.tool === 'scale') {
    panel.append(el('div', { class: 'note' },
      state.pending.length === 0
        ? 'Click the FIRST end of a measurement you know.'
        : 'Now click the SECOND end.'));
  }

  const valueRow = el('label', { class: 'field' });
  valueRow.append(el('span', {}, 'Measures'));
  const input = el('input', {
    type: 'number', step: '0.0625', min: '0', style: 'width:90px',
    value: s.value === null ? '' : String(s.value),
  });
  // Commit on every keystroke, but only rebuild the panel on blur/Enter —
  // re-rendering mid-word would steal the caret after the first character.
  input.oninput = () => {
    const v = Number(input.value);
    view.calib.scale.value = Number.isFinite(v) && v > 0 ? v : null;
    app.commit();
  };
  input.onchange = () => app.rerenderStep();
  const unit = el('select', {});
  for (const u of ['in', 'mm']) {
    const o = el('option', { value: u }, u);
    if (s.unit === u) o.selected = true;
    unit.append(o);
  }
  unit.onchange = () => { view.calib.scale.unit = unit.value; app.commit(); app.rerenderStep(); };
  valueRow.append(input, unit);
  panel.append(valueRow);

  if (cal.pxPerUnit) {
    panel.append(el('p', { class: 'hint strong mono' },
      `${cal.pxPerUnit.toFixed(2)} px per ${app.project.units}`));
    if (s.a && s.b) {
      const px = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      const frac = px / Math.max(app.images[viewId] ? app.images[viewId].width : 1, 1);
      if (frac < 0.15) {
        panel.append(el('div', { class: 'note warn' },
          'That span covers less than a sixth of the frame. Pick two points further apart if you can — short spans magnify click error.'));
      }
    }
  } else {
    panel.append(el('p', { class: 'hint' }, 'Click two points, then type the real distance between them.'));
  }

  const floorPanel = el('div', { class: 'panel' });
  floorPanel.append(el('h3', {}, 'Floor line'));
  const f = view.calib.floor;
  const fbtn = el('button', { class: state.tool === 'floor' ? 'primary' : '' },
    f.a && f.b ? 'Re-click the floor' : 'Click two floor points…');
  fbtn.onclick = () => {
    state.tool = state.tool === 'floor' ? null : 'floor';
    state.pending = [];
    app.rerenderStep();
  };
  floorPanel.append(el('div', { class: 'row' }, fbtn));
  if (state.tool === 'floor') {
    floorPanel.append(el('div', { class: 'note' },
      state.pending.length === 0
        ? 'Click where the floor meets one foot.'
        : 'Now click the floor at a foot on the other side.'));
  }
  floorPanel.append(el('p', { class: 'hint' },
    'Every height is measured up from this line. Phase 2 treats it as level at the average of your two clicks; both clicks are kept so a tilt correction can be added later.'));
  if (f.a && f.b) {
    const tilt = Math.abs(cal.floorTiltDeg);
    floorPanel.append(el('p', { class: `hint ${tilt > 2 ? 'strong' : ''}` },
      `Your two clicks are ${tilt.toFixed(1)}° off level.`));
    if (tilt > 2) {
      floorPanel.append(el('div', { class: 'note warn' },
        'That is a lot of tilt. Either the camera was not level or one click missed the floor — heights will be averaged and slightly off.'));
    }
  }

  const status = el('div', { class: 'panel' });
  status.append(el('h3', {}, 'Ready?'));
  status.append(el('p', { class: cal.ok ? 'hint strong' : 'hint' },
    cal.ok ? 'This view is calibrated.' : `Still needed: ${cal.problems.join(', ')}.`));

  // Re-applying is an explicit request, so it is allowed to overwrite.
  const note = markerNote(app, viewId, () => {
    applyElevationPrefill(view, view.markerCal, { onlyIfEmpty: false });
    app.commit();
    app.rerenderStep();
  });

  const frag = document.createDocumentFragment();
  if (note) frag.append(note);
  frag.append(panel, floorPanel, status);
  return frag;
}

function elevationHandlers(app, viewId) {
  const view = app.project.views[viewId];
  const pts = () => ({
    'scale.a': view.calib.scale.a,
    'scale.b': view.calib.scale.b,
    'floor.a': view.calib.floor.a,
    'floor.b': view.calib.floor.b,
  });
  return {
    hitTest(p, tol) {
      let best = null;
      let bestD = tol;
      for (const [id, q] of Object.entries(pts())) {
        if (!q) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= bestD) { bestD = d; best = id; }
      }
      return best;
    },
    onMoveItem(id, p) {
      const [group, key] = id.split('.');
      view.calib[group][key] = { x: p.x, y: p.y };
    },
    onMoveEnd() { app.commit(); app.rerenderStep(); },
    onPlace(p) {
      if (!state.tool) return;
      state.pending.push({ x: p.x, y: p.y });
      if (state.pending.length === 2) {
        const target = state.tool === 'scale' ? view.calib.scale : view.calib.floor;
        target.a = state.pending[0];
        target.b = state.pending[1];
        state.pending = [];
        state.tool = null;
        app.commit();
      }
      app.rerenderStep();
    },
    onPointer(p) {
      app.setStatus(`x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)} px`);
    },
    drawOverlay(ctx, v) {
      const s = view.calib.scale;
      const f = view.calib.floor;
      if (f.a && f.b) {
        const y = (f.a.y + f.b.y) / 2;
        const a = v.toScreen({ x: -1e5, y });
        const b = v.toScreen({ x: 1e5, y });
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
        if (!v.inLoupe) label(ctx, v.toScreen({ x: f.a.x, y }), 'floor', { color: '#5d6672', dy: 18 });
      }
      if (s.a && s.b) {
        const A = v.toScreen(s.a);
        const B = v.toScreen(s.b);
        const txt = s.value ? `${s.value} ${s.unit}` : 'type the length →';
        dimensionLine(ctx, A, B, v.inLoupe ? '' : txt);
      }
      for (const [id, q] of Object.entries(pts())) {
        if (!q) continue;
        const isFloor = id.startsWith('floor');
        dot(ctx, v.toScreen(q), {
          color: isFloor ? '#8b94a0' : '#33628f',
          r: v.inLoupe ? 4 : 5,
          hover: v.hoverId === id,
          selected: v.dragId === id,
        });
      }
      for (const q of state.pending) {
        dot(ctx, v.toScreen(q), { color: '#9a5b1c', r: v.inLoupe ? 4 : 5 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Top view: paper quad + rectification
// ---------------------------------------------------------------------------

function topTools(app) {
  const view = app.project.views.top;
  const paper = view.calib.paper;
  const cal = topCalibration(view, app.project.units);
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Paper target'));

  const kindRow = el('label', { class: 'field' });
  kindRow.append(el('span', {}, 'Sheet'));
  const sel = el('select', {});
  for (const [id, meta] of [['letter', 'US Letter — 8.5 × 11 in'], ['a4', 'A4 — 210 × 297 mm']]) {
    const o = el('option', { value: id }, meta);
    if (paper.kind === id) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => { changeQuad(app, () => { paper.kind = sel.value; }); };
  kindRow.append(sel);
  panel.append(kindRow);

  const clicked = paper.corners.length;
  const btn = el('button', { class: state.tool === 'corners' ? 'primary' : '' },
    clicked === 4 ? 'Re-click the 4 corners' : 'Click the 4 corners…');
  btn.onclick = () => {
    state.tool = state.tool === 'corners' ? null : 'corners';
    state.pending = [];
    app.rerenderStep();
  };
  panel.append(el('div', { class: 'row' }, btn));
  if (state.tool === 'corners') {
    panel.append(el('div', { class: 'note' },
      `Click corner ${state.pending.length + 1} of 4 — go around the sheet in order, either direction.`));
  } else if (clicked === 4) {
    panel.append(el('p', { class: 'hint' }, 'Drag any corner handle to fine-tune; the rectified view re-warps as you go.'));
  }

  if (clicked === 4) {
    const dims = paperDims(paper.kind, app.project.units);
    const r = safeRectify(app);
    const swapBtn = el('button', { class: 'tiny' }, 'Rotate 90°');
    swapBtn.onclick = () => { changeQuad(app, () => { paper.swap = !paper.swap; }); };
    panel.append(el('div', { class: 'row', style: 'margin-top:8px' },
      el('span', { class: 'hint strong mono' },
        r ? `${fmt(r.widthUnits)} × ${fmt(r.heightUnits)} ${app.project.units}` : '—'),
      swapBtn));
    panel.append(el('p', { class: 'hint' },
      `Long side ${fmt(dims.long)}, short side ${fmt(dims.short)} ${app.project.units}. If the rectified sheet looks stretched, rotate it.`));
    if (cal.pxPerUnit) {
      panel.append(el('p', { class: 'hint mono' },
        `${cal.pxPerUnit.toFixed(2)} rectified px per ${app.project.units}`));
    }
  }

  const status = el('div', { class: 'panel' });
  status.append(el('h3', {}, 'Ready?'));
  status.append(el('p', { class: cal.ok ? 'hint strong' : 'hint' },
    cal.ok ? 'The top view is rectified — its landmarks are clicked on the flattened image.'
      : `Still needed: ${cal.problems.join(', ')}.`));

  const note = markerNote(app, 'top', () => applyMarkerQuad(app, { onlyIfEmpty: false }));

  const frag = document.createDocumentFragment();
  if (note) frag.append(note);
  frag.append(panel, status);
  return frag;
}

/**
 * Push the marker-derived paper corners into the top view.
 *
 * Deliberately routed through `changeQuad`, the same function the manual
 * 4-corner click and every handle drag use: that is what recomputes pxPerUnit,
 * re-warps the rectified canvas and carries already-placed landmarks across.
 * The marker path adds no second pipeline — it just supplies the four points.
 *
 * Returns true when it wrote something. Exported for the Photos step, which
 * calls it the moment a top photo is attached.
 */
export function applyMarkerQuad(app, { onlyIfEmpty = true } = {}) {
  const view = app.project.views.top;
  const next = topPrefillCorners(view.markerCal, view, { onlyIfEmpty });
  if (!next) return false;
  const paper = view.calib.paper;
  changeQuad(app, () => {
    paper.kind = next.kind;
    paper.corners = next.corners;
    paper.swap = false;
  });
  return true;
}

function topHandlers(app) {
  const paper = app.project.views.top.calib.paper;
  return {
    hitTest(p, tol) {
      let best = null;
      let bestD = tol;
      paper.corners.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= bestD) { bestD = d; best = `corner.${i}`; }
      });
      return best;
    },
    onSelect() {
      // Capture the rectification BEFORE the corner moves, so any landmarks
      // already clicked on the rectified image can be carried across.
      state.quadBefore = safeRectify(app);
    },
    onMoveItem(id, p) {
      const i = Number(id.split('.')[1]);
      paper.corners[i] = { x: p.x, y: p.y };
      scheduleWarp(app, true);
    },
    onMoveEnd() {
      const before = state.quadBefore;
      state.quadBefore = null;
      changeQuad(app, () => {}, before);
    },
    onPlace(p) {
      if (state.tool !== 'corners') return;
      state.pending.push({ x: p.x, y: p.y });
      if (state.pending.length === 4) {
        const next = state.pending.slice();
        state.pending = [];
        state.tool = null;
        changeQuad(app, () => { paper.corners = next; });
        return;
      }
      app.rerenderStep();
    },
    onPointer(p) { app.setStatus(`x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)} px`); },
    drawOverlay(ctx, v) {
      const pts = [...paper.corners, ...state.pending];
      if (paper.corners.length === 4) {
        ctx.save();
        ctx.strokeStyle = '#33628f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        paper.corners.forEach((q, i) => {
          const s = v.toScreen(q);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(51,98,143,.13)';
        ctx.fill();
        ctx.restore();
      }
      pts.forEach((q, i) => {
        dot(ctx, v.toScreen(q), {
          color: i < paper.corners.length ? '#33628f' : '#9a5b1c',
          r: v.inLoupe ? 4 : 6,
          hover: v.hoverId === `corner.${i}`,
          selected: v.dragId === `corner.${i}`,
        });
        if (!v.inLoupe) label(ctx, v.toScreen(q), String(i + 1), { dy: -13 });
      });
    },
  };
}

/** Recompute pxPerUnit, remap any placed top landmarks, re-warp, re-render. */
function changeQuad(app, mutate, beforeOverride) {
  const view = app.project.views.top;
  const paper = view.calib.paper;
  const before = beforeOverride !== undefined
    ? beforeOverride
    : (paper.corners.length === 4 ? safeRectify(app) : null);
  mutate();
  if (paper.corners.length === 4) {
    const dims = paperDims(paper.kind, app.project.units);
    paper.pxPerUnit = RECT_LONG_SIDE / dims.long;
  }
  const after = paper.corners.length === 4 ? safeRectify(app) : null;
  const traceIds = Object.keys(view.traces || {});
  if (before && after && (Object.keys(view.landmarks).length || traceIds.length)) {
    const back = invert(before.H);
    const carry = (p) => {
      try {
        return apply(after.H, apply(back, p));
      } catch (err) {
        return p;
      }
    };
    const moved = {};
    for (const [id, p] of Object.entries(view.landmarks)) moved[id] = carry(p);
    view.landmarks = moved;
    // Traced curve points live in the same rectified space as the landmarks and
    // have to travel with them, or re-warping the sheet would leave a comb
    // trace lying across the photo where the comb no longer is.
    for (const id of traceIds) view.traces[id] = view.traces[id].map(carry);
  }
  app.commit();
  app.rerenderStep();
}

function safeRectify(app) {
  const paper = app.project.views.top.calib.paper;
  if (paper.corners.length !== 4) return null;
  try {
    return rectifyPlan(paper.corners, {
      paper: paper.kind,
      units: app.project.units,
      pxPerUnit: paper.pxPerUnit,
      swap: paper.swap,
    });
  } catch (err) {
    return null;
  }
}

function rectifiedPreview(app) {
  const panel = el('div', { class: 'panel', style: 'margin-top:14px' });
  panel.append(el('h3', {}, 'Rectified — every top landmark is clicked here'));
  const holder = el('div', { class: 'viewport-wrap short' });
  const canvas = el('canvas', { id: 'rect-preview' });
  holder.append(canvas);
  panel.append(holder);
  panel.append(el('p', { class: 'hint' },
    `Grid squares are ${app.project.units === 'mm' ? '25 mm' : '1 inch'}. If they look square and evenly spaced across the sheet, the calibration is good.`));
  return panel;
}

let warpTimer = null;

/**
 * Rebuild the rectified bitmap. `fast` uses a lower resolution for dragging.
 * Deliberately a timer and not requestAnimationFrame: rAF does not fire while
 * the tab is hidden, and the rectified image is state the rest of the app
 * depends on, not just something on screen.
 */
export function scheduleWarp(app, fast) {
  if (warpTimer) clearTimeout(warpTimer);
  warpTimer = setTimeout(() => {
    warpTimer = null;
    doWarp(app, fast);
  }, fast ? 16 : 0);
}

/** Warp now, at full resolution, if we do not already have a good one. */
export function ensureRectified(app) {
  const r = app.images.topRect;
  if (r && r.scale === 1) return r;
  doWarp(app, false);
  return app.images.topRect;
}

function doWarp(app, fast) {
  const r = safeRectify(app);
  const src = app.images.top;
  const preview = document.getElementById('rect-preview');
  if (!r || !src) { app.images.topRect = null; return; }
  const div = fast ? DRAG_DIVISOR : 1;
  const W = Math.max(2, Math.round(r.widthPx / div));
  const H = Math.max(2, Math.round(r.heightPx / div));
  const out = warpImage(src, r, W, H);
  app.images.topRect = { bitmap: out, width: r.widthPx, height: r.heightPx, scale: div };
  app.project.views.top.rectWidth = r.widthPx;
  app.project.views.top.rectHeight = r.heightPx;
  if (preview) paintPreview(app, preview, r);
}

/** Inverse-map each rectified pixel back into the photo (bilinear). */
function warpImage(src, r, W, H) {
  const srcCanvas = sourceCanvas(src);
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const sdata = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const S = sdata.data;
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  const odata = octx.createImageData(W, H);
  const O = odata.data;
  const Hi = invert(r.H);
  const kx = r.widthPx / W;
  const ky = r.heightPx / H;

  for (let y = 0; y < H; y += 1) {
    const ry = (y + 0.5) * ky;
    for (let x = 0; x < W; x += 1) {
      const rx = (x + 0.5) * kx;
      const w = Hi[6] * rx + Hi[7] * ry + Hi[8];
      const sx = (Hi[0] * rx + Hi[1] * ry + Hi[2]) / w;
      const sy = (Hi[3] * rx + Hi[4] * ry + Hi[5]) / w;
      const o = (y * W + x) * 4;
      if (!(sx >= 0 && sy >= 0 && sx < sw - 1 && sy < sh - 1)) {
        O[o] = 43; O[o + 1] = 47; O[o + 2] = 52; O[o + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      for (let c = 0; c < 3; c += 1) {
        O[o + c] = S[i00 + c] * w00 + S[i10 + c] * w10 + S[i01 + c] * w01 + S[i11 + c] * w11;
      }
      O[o + 3] = 255;
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

const srcCache = new WeakMap();
function sourceCanvas(src) {
  if (srcCache.has(src.bitmap)) return srcCache.get(src.bitmap);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src.bitmap, 0, 0);
  srcCache.set(src.bitmap, c);
  return c;
}

function paintPreview(app, canvas, r) {
  const rect = app.images.topRect;
  if (!rect) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth || 600;
  const ch = canvas.clientHeight || 300;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b2f34';
  ctx.fillRect(0, 0, cw, ch);
  const s = Math.min((cw - 16) / r.widthPx, (ch - 16) / r.heightPx);
  const ox = (cw - r.widthPx * s) / 2;
  const oy = (ch - r.heightPx * s) / 2;
  ctx.drawImage(rect.bitmap, 0, 0, rect.bitmap.width, rect.bitmap.height,
    ox, oy, r.widthPx * s, r.heightPx * s);

  // metric grid
  const stepUnits = app.project.units === 'mm' ? 25 : 1;
  const stepPx = stepUnits * r.pxPerUnit * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, r.widthPx * s, r.heightPx * s);
  ctx.clip();
  ctx.lineWidth = 1;
  let i = 0;
  for (let x = 0; x <= r.widthPx * s + 0.5; x += stepPx, i += 1) {
    ctx.strokeStyle = i % 6 === 0 ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.26)';
    ctx.beginPath(); ctx.moveTo(ox + x, oy); ctx.lineTo(ox + x, oy + r.heightPx * s); ctx.stroke();
  }
  i = 0;
  for (let y = 0; y <= r.heightPx * s + 0.5; y += stepPx, i += 1) {
    ctx.strokeStyle = i % 6 === 0 ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.26)';
    ctx.beginPath(); ctx.moveTo(ox, oy + y); ctx.lineTo(ox + r.widthPx * s, oy + y); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------

export function activeViewId() { return state.viewId; }
export function setActiveView(id) { state.viewId = id; }

function fmt(v) {
  return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
}

const fmtMm = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const fmtPx = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : '—');
