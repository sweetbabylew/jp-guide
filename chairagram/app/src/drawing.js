// drawing.js — step 5. Live renderer output, downloads, onion-skin overlays.
//
// UI module. The only place in the annotator that talks to the renderer.

import { el } from './viewport.js';
import {
  forwardGeometry, frontFrame, sideFrame, viewCalibration, curveProvenance,
  COUNT_PHRASE,
} from './solve.js';
import {
  exportProject, projectSlug, EMBED_MAX_PX, EMBED_QUALITY,
} from './store.js';
import { trustBanner } from './spectable.js';
import { loadManifest, rulerScale } from './markercal.js';

/**
 * ANNOTATOR.md specifies `import { renderPackage } from '../renderer/render.mjs'`
 * as a "pure, browser-safe entry". As shipped it is not: render.mjs is also the
 * CLI and statically imports `node:fs/promises` and `node:path`, which no
 * browser can resolve, so the whole module graph fails to instantiate. The
 * renderer is off limits to this agent, so we try the documented entry first
 * (the moment it becomes browser-safe this picks it up) and otherwise rebuild
 * the exact same function from the renderer's own pure internals — same inputs,
 * same three files, byte for byte. app/test.mjs asserts the two agree.
 *
 * The promise is DROPPED on failure. A memoised rejection is what makes a
 * "Retry" button a lie: the module cache keeps handing back the same dead
 * promise however many times it is pressed, so the user restarts their server,
 * presses Retry, and watches the identical error appear. Same pattern as
 * getDetector() in steps.js.
 */
let rendererPromise = null;
let loadAttempt = 0;

/**
 * Dropping our own promise is necessary but NOT sufficient: a browser also
 * remembers, for the life of the document, every module specifier whose fetch
 * failed, and hands the same failure back to the next `import()` of that exact
 * specifier — so a Retry after the server comes back would still fail, which is
 * the same lie in a different place. A retry therefore asks for a specifier the
 * module map has never seen. The query means nothing to the server; it is only
 * there so the browser fetches again. Measured in the field-test browser:
 * without it, Retry never recovers.
 */
const attempt = (path) => (loadAttempt === 0 ? path : `${path}?retry=${loadAttempt}`);

export function loadRenderer() {
  if (rendererPromise) return rendererPromise;
  rendererPromise = (async () => {
    try {
      const m = await import(attempt('../../renderer/render.mjs'));
      if (typeof m.renderPackage === 'function') return m.renderPackage;
    } catch (err) {
      // expected in the browser while render.mjs doubles as the node CLI
    }
    return browserRenderPackage();
  })().catch((err) => {
    rendererPromise = null;
    loadAttempt += 1;
    throw err;
  });
  return rendererPromise;
}

/** One of the renderer modules, used to tell "server gone" from "wrong path". */
const RENDERER_PROBE = '../../renderer/src/schema.js';

/**
 * Why the renderer would not load. The two failures need different advice and
 * look identical from the import's own error message:
 *
 *   'server'  the fetch itself rejected — the local server has stopped (or the
 *             page was opened straight off the disk, where nothing can be
 *             fetched at all). Restarting the server fixes it.
 *   'http'    the server answered, with a status. The app is being served from
 *             the wrong folder, so ../renderer is not above it.
 *   'other'   the files are reachable and something else broke; show the raw
 *             message rather than inventing a cause.
 */
export async function classifyRendererFailure(fetchImpl = fetch) {
  const url = new URL(RENDERER_PROBE, import.meta.url).href;
  try {
    const res = await fetchImpl(url, { cache: 'no-store' });
    if (res.ok) return { kind: 'other', url };
    return { kind: 'http', status: res.status, url };
  } catch (err) {
    return { kind: 'server', url, detail: err.message };
  }
}

/** The error strip's copy for each failure mode. Pure, so it can be checked. */
export function rendererFailureCopy(diagnosis, err) {
  const message = (err && err.message) || 'unknown error';
  if (diagnosis.kind === 'server') {
    return {
      title: 'The renderer could not be loaded — nothing answered at that address.',
      detail: `The browser could not fetch ${diagnosis.url}. The local server has probably stopped (or this page was opened from a file:// path, where no module can be fetched at all).`,
      fix: 'Start the server again — python3 -m http.server 8017 -d ~/Documents/GitHub/chairs/chairagram — then press Retry. Nothing in your project is lost; it is all still here.',
    };
  }
  if (diagnosis.kind === 'http') {
    return {
      title: `The renderer is not where the app expects it (HTTP ${diagnosis.status}).`,
      detail: `The server answered ${diagnosis.status} for ${diagnosis.url}.`,
      fix: 'Serve the chairagram/ folder itself, not app/ — the app loads ../renderer and ../specs from one level up. Then press Retry.',
    };
  }
  return {
    title: 'The renderer could not be loaded.',
    detail: message,
    fix: 'The renderer files are reachable, so this is something else — the browser console will name it. Press Retry once the cause is fixed.',
  };
}

/**
 * What to do about a spec the renderer would not draw. Pure, so it can be
 * checked.
 *
 * The two answers are not interchangeable. A number is fixed by typing over it
 * on the Spec step; a CURVE cannot be — the Spec step shows curves read-only
 * (they are shapes, not numbers), and the only place to change one is the trace
 * on the Landmarks step. Sending someone to a step that cannot fix their
 * problem is worse than saying nothing.
 */
export function rejectionAdvice(message = '') {
  if (/planCurve|seat\.plan\.points|arms\.bow/.test(message)) {
    return 'That is a traced curve, not a number: re-trace it on the Landmarks step, top view '
      + '(curves are read-only on the Spec step — clear the trace there and the template’s shape comes back).';
  }
  return 'Fix the flagged number on the Spec step — every field is editable there.';
}

async function browserRenderPackage() {
  const [schema, geometry, pkg, seat] = await Promise.all([
    import(attempt('../../renderer/src/schema.js')),
    import(attempt('../../renderer/src/geometry.js')),
    import(attempt('../../renderer/src/package.js')),
    import(attempt('../../renderer/src/seatPattern.js')),
  ]);
  return function renderPackage(specInput, { specName = 'spec.json', provenance = null } = {}) {
    const { spec, warnings } = schema.validate(specInput);
    const model = geometry.resolve(spec);
    return {
      warnings,
      model,
      files: {
        'sheet.svg': pkg.buildSheet(model, { specName, provenance }),
        'seat-pattern.svg': seat.buildSeatPattern(model, { specName, provenance }),
        'angles.json': `${JSON.stringify(pkg.buildAngles(model, specName, { provenance }), null, 2)}\n`,
      },
    };
  };
}

// ---------------------------------------------------------------------------
// What the exported files are allowed to say
// ---------------------------------------------------------------------------
//
// The banner on this page has always told the truth; the FILES did not. Every
// sheet.svg was titled "measured drawing" and seat-pattern.svg — the thing
// people cut around — said nothing at all about where its shape came from.
// D10 says the template must never impersonate output, and a file that leaves
// the browser is where that matters most: the banner stays behind, the file
// does not. The renderer knows nothing about photos or fields, so everything
// it needs goes across as plain counts and plain strings (RENDERER.md).

/** Per-view calibration, in one short phrase each. */
export function calibrationSummary(project) {
  const out = [];
  for (const id of ['front', 'side', 'top']) {
    const view = project.views[id];
    if (!view || !view.present) continue;
    const cal = viewCalibration(project, id);
    const mc = view.markerCal;
    let detail = 'set by hand';
    if (!cal.ok) detail = 'not calibrated';
    else if (mc && mc.status === 'used' && Number.isFinite(mc.residualMm)) {
      detail = `printed sheet, ${mc.residualMm.toFixed(2)} mm fit`;
    }
    out.push({ view: id, detail });
  }
  return out;
}

/**
 * The trust report, as the renderer's provenance option. Same numbers as the
 * banner, same phrasing (COUNT_PHRASE is the one source), so the screen and
 * the download cannot drift apart.
 */
export function provenanceFor(app) {
  const trust = app.solved && app.solved.trust;
  if (!trust) return null;
  return {
    state: trust.state,
    measured: trust.measured,
    total: trust.total,
    countPhrase: COUNT_PHRASE,
    templateName: trust.templateName,
    untraced: (trust.untracedCurves || []).map((c) => c.shortName || c.label),
    calibration: calibrationSummary(app.project),
  };
}

const state = {
  onion: { front: false, side: false },
  opacity: 0.75,
  timer: null,
  files: null,
  error: null,
};

export function renderDrawing(app, root) {
  root.textContent = '';
  root.append(el('h2', {}, 'Drawing'));
  root.append(el('p', { class: 'lede' },
    'The chairmaker package, drawn from the spec. It redraws whenever a number changes.'));

  // The template must never impersonate output: before the drawing, the count.
  const banner = app.solved && trustBanner(app.solved.trust);
  if (banner) root.append(banner);

  const cols = el('div', { class: 'cols canvas' });
  const left = el('div', {});
  const right = el('div', {});
  cols.append(left, right);
  root.append(cols);

  const holder = el('div', { class: 'sheet-holder', id: 'sheet-holder' });
  holder.append(el('p', { class: 'hint' }, 'Rendering…'));
  left.append(holder);
  const curvePanel = curveSourcePanel(app);
  if (curvePanel) left.append(curvePanel);
  left.append(scaleCheckPanel());
  // after the append, or it would be painting a node that is not in the page
  // yet — and the scale check has to survive a renderer that never loads.
  paintScaleCheck(app);

  const dlPanel = el('div', { class: 'panel' });
  dlPanel.append(el('h3', {}, 'Downloads'));
  const dl = el('div', { class: 'dl' });
  dl.append(
    dlButton(app, 'sheet.svg', 'image/svg+xml'),
    dlButton(app, 'seat-pattern.svg', 'image/svg+xml'),
    dlButton(app, 'angles.json', 'application/json'),
  );
  dlPanel.append(dl);

  const withPhotos = el('label', { class: 'field', style: 'margin-top:10px' });
  const cb = el('input', { type: 'checkbox' });
  withPhotos.append(cb, el('span', { style: 'min-width:0' }, 'include downscaled photos'));
  const projBtn = el('button', {}, 'project.json');
  projBtn.onclick = () => downloadProject(app, cb.checked);
  dlPanel.append(el('div', { class: 'row' }, projBtn, withPhotos));
  dlPanel.append(el('p', { class: 'hint' },
    `Photos are re-encoded to ${EMBED_MAX_PX} px on the long side at quality ${EMBED_QUALITY}, and dropped entirely if the file would grow past the cap. Without them the project still carries every click.`));
  right.append(dlPanel);

  right.append(onionPanel(app));

  rerenderSheet(app);
}

export function invalidate(app) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    rerenderSheet(app);
    paintOnion(app);
  }, 250);
}

export function destroy() {
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
}

// ---------------------------------------------------------------------------

const RENDERER_ERROR_KEY = 'renderer-load';

async function rerenderSheet(app) {
  const holder = document.getElementById('sheet-holder');
  if (!holder || !app.solved) return;
  let renderPackage;
  try {
    renderPackage = await loadRenderer();
    app.dismissError(RENDERER_ERROR_KEY);
  } catch (err) {
    // Which failure it is decides what the user should do about it, so find
    // out before saying anything. The strip stays until it is fixed; Retry
    // re-runs the whole load (loadRenderer no longer caches the failure).
    const diagnosis = await classifyRendererFailure();
    const copy = rendererFailureCopy(diagnosis, err);
    app.showError({
      key: RENDERER_ERROR_KEY,
      ...copy,
      actions: [{ label: 'Retry', onClick: () => rerenderSheet(app) }],
    });
    holder.textContent = '';
    holder.append(el('div', { class: 'note bad' },
      el('div', { style: 'font-weight:600' }, copy.title),
      el('div', { class: 'hint', style: 'margin-top:5px' }, copy.fix)));
    return;
  }
  if (holder.isConnected === false) return;
  holder.textContent = '';
  try {
    const out = renderPackage(app.solved.spec, {
      specName: `${projectSlug(app.project)}.json`,
      provenance: provenanceFor(app),
    });
    state.files = out.files;
    state.error = null;
    holder.innerHTML = out.files['sheet.svg'];
    if (out.warnings && out.warnings.length) {
      const w = el('div', { class: 'note warn' });
      w.append(el('div', {}, 'The renderer flagged:'));
      for (const line of out.warnings) w.append(el('div', { class: 'hint strong' }, `· ${line}`));
      holder.prepend(w);
    }
  } catch (err) {
    state.files = null;
    state.error = err.message;
    holder.append(el('div', { class: 'note bad' },
      el('div', { style: 'font-weight:600' }, 'The renderer rejected this spec.'),
      el('div', { class: 'mono', style: 'margin-top:5px' }, err.message),
      el('div', { class: 'hint', style: 'margin-top:6px' }, rejectionAdvice(err.message))));
  }
  refreshDownloads();
  paintOnion(app);
  paintScaleCheck(app);
}

// ---------------------------------------------------------------------------
// Where the curves came from
// ---------------------------------------------------------------------------
//
// The Spec tab has always said this; the Drawing step is where the shapes are
// actually LOOKED AT, and a bow drawn from BOW_DEFAULTS looks exactly as
// convincing as a traced one. So it goes under the sheet as well, per curve,
// whether or not the banner is showing.

function curveSourcePanel(app) {
  if (!app.solved) return null;
  const rows = curveProvenance(app.solved.spec, app.solved.curves || {}, app.template);
  if (!rows.length) return null;
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Curves in this drawing'));
  for (const row of rows) {
    const traced = row.source === 'measured';
    const line = el('div', { class: 'row', style: 'align-items:baseline;gap:8px' });
    line.append(el('span', { class: `badge ${traced ? 'measured' : 'template'}` },
      traced ? 'measured' : 'template'));
    line.append(el('span', { style: 'font-size:13px' },
      traced ? `${row.label} — traced on your top view` : row.advice));
    panel.append(line);
  }
  return panel;
}

// ---------------------------------------------------------------------------
// The scale check
// ---------------------------------------------------------------------------
//
// The sheet's own footer says "scale check: —" and the renderer is not this
// workstream's to change, so the live answer goes under the sheet, where it can
// also be red. "—" reads as "fine, nothing to report"; "no calibration" reads
// as what it is.

function scaleCheckPanel() {
  const panel = el('div', { class: 'panel', id: 'scale-check' });
  panel.append(el('h3', {}, 'Scale check'));
  return panel;      // filled by paintScaleCheck once it is in the document
}

/** Which views can turn pixels into inches at all. */
function calibratedViews(project) {
  return ['front', 'side', 'top'].filter(
    (id) => project.views[id].present && viewCalibration(project, id).ok,
  );
}

async function paintScaleCheck(app) {
  const node = document.getElementById('scale-check');
  if (!node) return;
  node.textContent = '';
  node.append(el('h3', {}, 'Scale check'));

  const project = app.project;
  const views = calibratedViews(project);
  if (!views.length) {
    node.append(el('div', { class: 'note bad' },
      el('div', { style: 'font-weight:600' }, 'scale check: no calibration'),
      el('div', { class: 'hint', style: 'margin-top:4px' },
        'Nothing in this drawing has a real size yet — it is the template at the template’s dimensions. '
        + 'Set a scale on the Calibrate step (or photograph the printed marker sheet and it does it for you).')));
    return;
  }

  const marker = ['front', 'side', 'top']
    .map((id) => project.views[id].markerCal)
    .filter((mc) => mc && mc.status === 'used');
  const lines = [];
  lines.push(`calibrated: ${views.join(', ')}`);
  if (marker.length) {
    const best = marker.reduce((a, b) => (a.residualMm <= b.residualMm ? a : b));
    lines.push(`printed sheet: ${marker.length} view${marker.length === 1 ? '' : 's'}, best fit ${best.residualMm.toFixed(2)} mm`);
  }
  const list = el('div', { class: 'hint mono' });
  for (const line of lines) list.append(el('div', {}, line));
  node.append(list);

  // The signed print-scale percentage, when the user measured the printed
  // verification bar. The nominal bar length comes from the manifest — no
  // constant of ours goes anywhere near this number (MARKER.md).
  if (!project.ruler || !project.ruler.value) {
    node.append(el('p', { class: 'hint' },
      'No printed bar measured, so the print is assumed honest. Measure the verification bar on your sheet (Photos step) and this becomes a real number.'));
    return;
  }
  const variant = ['front', 'side', 'top']
    .map((id) => project.views[id].markerCal && project.views[id].markerCal.variant)
    .find(Boolean) || 'letter';
  let manifest;
  try {
    manifest = await loadManifest(variant);
  } catch (err) {
    return;
  }
  const k = rulerScale(manifest, project.ruler);
  if (!node.isConnected) return;
  if (!k) {
    node.append(el('div', { class: 'note warn' },
      'The bar reading on the Photos step is not plausible for either printed bar, so it is being ignored.'));
    return;
  }
  const sign = k.pct >= 0 ? '+' : '';
  const off = Math.abs(k.pct) >= 0.5;
  node.append(el('div', { class: off ? 'note warn' : 'note' },
    el('div', { class: 'mono', style: 'font-weight:600' },
      `scale check: print scale ${sign}${k.pct.toFixed(2)}%`),
    el('div', { class: 'hint', style: 'margin-top:4px' },
      `Your ${k.nominalMm} mm bar measured ${k.measuredMm.toFixed(1)} mm, so every reading off that sheet is corrected by ${k.k.toFixed(4)}×`
      + (off ? ' — worth reprinting at 100% if you can.' : '.'))));
}

function refreshDownloads() {
  for (const btn of document.querySelectorAll('[data-dl]')) {
    btn.disabled = !state.files;
  }
}

function dlButton(app, name, mime) {
  const b = el('button', { 'data-dl': name }, name);
  b.onclick = () => {
    if (!state.files) return;
    saveBlob(new Blob([state.files[name]], { type: mime }), `${projectSlug(app.project)}-${name}`);
  };
  return b;
}

function downloadProject(app, withPhotos) {
  const embeds = withPhotos ? makeEmbeds(app) : null;
  const { payload, warnings } = exportProject(app.project, embeds);
  for (const w of warnings) app.toast(w);
  saveBlob(
    new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }),
    `${projectSlug(app.project)}-project.json`,
  );
}

export function makeEmbeds(app) {
  const out = {};
  for (const id of ['front', 'side', 'top']) {
    const img = app.images[id];
    if (!img) continue;
    const k = Math.min(1, EMBED_MAX_PX / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img.bitmap, 0, 0, c.width, c.height);
    out[id] = {
      name: app.project.views[id].imageName,
      dataUrl: c.toDataURL('image/jpeg', EMBED_QUALITY),
    };
  }
  return out;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Onion-skin
// ---------------------------------------------------------------------------

function onionPanel(app) {
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Onion-skin check'));
  panel.append(el('p', { class: 'hint' },
    'Draws the elevation wireframe back over your photo, anchored on the floor line and the seat’s front edge. If a line sits off the chair, that number is wrong.'));

  for (const id of ['front', 'side']) {
    const view = app.project.views[id];
    const row = el('label', { class: 'field' });
    const cb = el('input', { type: 'checkbox' });
    cb.checked = state.onion[id];
    cb.disabled = !view.present || !app.images[id];
    cb.onchange = () => { state.onion[id] = cb.checked; paintOnion(app); };
    row.append(cb, el('span', { style: 'min-width:0' }, `${id} elevation`));
    panel.append(row);
  }

  const slider = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: String(state.opacity) });
  slider.oninput = () => { state.opacity = Number(slider.value); paintOnion(app); };
  panel.append(el('label', { class: 'field' }, el('span', {}, 'Opacity'), slider));

  const holder = el('div', { class: 'onion', id: 'onion-holder' });
  panel.append(holder);
  return panel;
}

function paintOnion(app) {
  const holder = document.getElementById('onion-holder');
  if (!holder || !app.solved) return;
  holder.textContent = '';
  for (const id of ['front', 'side']) {
    if (!state.onion[id]) continue;
    const img = app.images[id];
    const frame = id === 'front' ? frontFrame(app.project) : sideFrame(app.project);
    if (!img) continue;
    if (!frame) {
      holder.append(el('div', { class: 'note warn' },
        `The ${id} view needs its scale, floor line and seat landmarks before the overlay can be anchored.`));
      continue;
    }
    const canvas = el('canvas');
    holder.append(canvas);
    // Let layout settle so clientWidth is real, then paint. A timer rather
    // than rAF: rAF never fires while the tab is hidden.
    setTimeout(() => paintOne(app, canvas, img, frame, id), 0);
  }
}

function paintOne(app, canvas, img, frame, viewId) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth || 300;
  const ch = Math.round((cw * img.height) / img.width);
  canvas.style.height = `${ch}px`;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img.bitmap, 0, 0, img.width, img.height, 0, 0, cw, ch);

  const k = cw / img.width;
  const P = (chairPt) => {
    const p = frame.toImage(chairPt);
    return { x: p.x * k, y: p.y * k };
  };
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.strokeStyle = '#ff5a2b';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  for (const poly of wireframe(app.solved.spec, viewId)) {
    ctx.beginPath();
    poly.forEach((pt, i) => {
      const s = P(pt);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    if (poly.closed) ctx.closePath();
    ctx.stroke();
  }
  // the floor line the heights are measured from
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.2;
  const fy = frame.floorY * k;
  ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(cw, fy); ctx.stroke();
  ctx.restore();
}

/**
 * The elevation wireframe as chair-frame polylines. Front-view points carry
 * {x, y}; side-view points carry {z, y} — matching the two frames in solve.js.
 */
export function wireframe(spec, viewId) {
  const g = forwardGeometry(spec);
  const out = [];
  const add = (pts, closed = false) => { pts.closed = closed; out.push(pts); };

  if (viewId === 'front') {
    const hw = g.seat.width / 2;
    const top = g.seat.heightFront;
    const bot = g.seat.frontBottom.y;
    add([{ x: -hw, y: top }, { x: hw, y: top }, { x: hw, y: bot }, { x: -hw, y: bot }], true);
    for (const leg of g.legs) {
      add([{ x: leg.foot.x, y: 0 }, { x: leg.mortise.x, y: leg.mortise.y }]);
      if (leg.top.y > leg.mortise.y) add([{ x: leg.mortise.x, y: leg.mortise.y }, { x: leg.top.x, y: leg.top.y }]);
    }
    for (const s of g.sticks.items) {
      add([{ x: s.x, y: s.base.y }, { x: s.x, y: s.top.y }]);
    }
    const cl = g.crest.length / 2;
    const cTop = g.crest.bottom.y + g.crest.height * Math.cos((g.crest.tilt * Math.PI) / 180);
    add([{ x: -cl, y: g.crest.bottom.y }, { x: cl, y: g.crest.bottom.y },
      { x: cl, y: cTop }, { x: -cl, y: cTop }], true);
    if (g.arms && g.arms.bow) {
      // A bow reads in the front view as one band across the chair, from the
      // left of the traced curve to the right of it (RENDERER.md v0.2).
      const { xMin, xMax } = g.arms.bow;
      add([{ x: xMin, y: g.arms.topY }, { x: xMax, y: g.arms.topY },
        { x: xMax, y: g.arms.botY }, { x: xMin, y: g.arms.botY }], true);
    } else if (g.arms) {
      for (const [a, b] of [[g.arms.insideLeft - g.arms.boardWidth, g.arms.insideLeft],
        [g.arms.insideRight, g.arms.insideRight + g.arms.boardWidth]]) {
        add([{ x: a, y: g.arms.topY }, { x: b, y: g.arms.topY },
          { x: b, y: g.arms.botY }, { x: a, y: g.arms.botY }], true);
      }
    }
    return out;
  }

  // side
  add([
    { z: 0, y: g.seat.heightFront },
    { z: g.seat.depth, y: g.seat.heightBack },
    { z: g.seat.depth, y: g.seat.backBottom.y },
    { z: 0, y: g.seat.frontBottom.y },
  ], true);
  for (const leg of g.legs) {
    if (leg.side === 'left') continue;          // the pair coincides in this view
    add([{ z: leg.foot.z, y: 0 }, { z: leg.mortise.z, y: leg.mortise.y }]);
    if (leg.top.y > leg.mortise.y) add([{ z: leg.mortise.z, y: leg.mortise.y }, { z: leg.top.z, y: leg.top.y }]);
  }
  const st = g.sticks.items[g.sticks.items.length - 1];
  add([{ z: st.base.z, y: st.base.y }, { z: st.top.z, y: st.top.y }]);
  const tilt = (g.crest.tilt * Math.PI) / 180;
  const u = { z: Math.sin(tilt), y: Math.cos(tilt) };
  const t = { z: Math.cos(tilt), y: -Math.sin(tilt) };
  const half = g.crest.thickness / 2;
  const P0 = g.crest.bottom;
  const bf = { z: P0.z - t.z * half, y: P0.y - t.y * half };
  const bb = { z: P0.z + t.z * half, y: P0.y + t.y * half };
  add([
    bf, bb,
    { z: bb.z + u.z * g.crest.height, y: bb.y + u.y * g.crest.height },
    { z: bf.z + u.z * g.crest.height, y: bf.y + u.y * g.crest.height },
  ], true);
  if (g.arms && g.arms.bow) {
    // side view: the bow spans from its tips to its apex, at one level height
    add([{ z: g.arms.bow.tipZ, y: g.arms.topY }, { z: g.arms.bow.apexZ, y: g.arms.topY },
      { z: g.arms.bow.apexZ, y: g.arms.botY }, { z: g.arms.bow.tipZ, y: g.arms.botY }], true);
  } else if (g.arms) {
    const zEnd = spec.arms.length === null || spec.arms.length === undefined
      ? g.seat.depth + g.arms.boardWidth : spec.arms.length;
    add([{ z: 0, y: g.arms.topY }, { z: zEnd, y: g.arms.topY },
      { z: zEnd, y: g.arms.botY }, { z: 0, y: g.arms.botY }], true);
  }
  return out;
}
