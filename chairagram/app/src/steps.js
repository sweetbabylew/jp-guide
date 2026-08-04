// steps.js — the app entry point: the five-step flow, the shared `app` object,
// the Photos step and the Landmarks step.
//
// UI module. Calibrate, Spec and Drawing each own their own file; this one
// routes between them and holds the runtime image registry (photos never leave
// the browser and never go into localStorage).

import {
  createProject, loadLocal, saveLocal, clearLocal, importProject, exportProject,
  projectSlug, isSamePhoto, clearViewWork, restoreLandmarkSources,
  convertProjectUnits,
} from './store.js';
import { TEMPLATE_META, loadTemplateSpec, templateInUnits } from './templates.js';
import { solveProject, viewCalibration } from './solve.js';
import {
  scheduleForView, seedLandmarks, isPlaced, isSeeded, progress, nextUnplaced,
  nudgeAmount, GROUPS, VIEW_LABEL,
  traceSpecsForView, traceStatus, tracePreview, traceMeasure, arcAssist, snapToArc,
  traceClickBlock,
} from './landmarks.js';
import { Viewport, dot, crosshair, label, el, viewTabs, isTyping } from './viewport.js';
import {
  renderCalibrate, destroy as destroyCalibrate, ensureRectified, applyMarkerQuad,
} from './calibrate.js';
import {
  decodePhoto, planDetectionDownscale, calibrateView, applyElevationPrefill,
  loadManifest, variantForIds, noSheetResult, emptyResult, datumLengthMm,
  rulerScale, sheetUrl,
} from './markercal.js';
import { renderSpec, trustChip } from './spectable.js';
import { renderDrawing, destroy as destroyDrawing, invalidate as invalidateDrawing } from './drawing.js';

const STEPS = [
  { id: 'photos', label: 'Photos', root: 'step-photos' },
  { id: 'calibrate', label: 'Calibrate', root: 'step-calibrate' },
  { id: 'landmarks', label: 'Landmarks', root: 'step-landmarks' },
  { id: 'spec', label: 'Spec', root: 'step-spec' },
  { id: 'drawing', label: 'Drawing', root: 'step-drawing' },
];

const app = {
  project: null,
  templateRaw: null,
  template: null,
  images: { front: null, side: null, top: null, topRect: null },
  solved: null,
  step: 'photos',
  // { viewId: { landmarkId: 'clicked' | 'seeded' } } as of the last commit —
  // see restoreLandmarkSources. Re-warping the top view's paper quad rewrites
  // every top landmark's coordinates through a new homography, and a plain
  // point transform has no reason to know about provenance; this is what
  // carries it across that, and across anything like it added later.
  lmSources: {},

  commit() {
    this.lmSources = restoreLandmarkSources(this.project, this.lmSources);
    const ok = saveLocal(this.project, safeStorage());
    setStatusRight(ok ? 'autosaved' : 'autosave unavailable (storage full or blocked)');
    this.resolve();
    paintStepper();
    // The sheet is live: any spec change redraws it, debounced.
    if (this.step === 'drawing') invalidateDrawing(this);
  },
  resolve() {
    if (!this.template) return;
    try {
      this.solved = solveProject(this.project, this.template);
    } catch (err) {
      this.solved = null;
      this.toast(`Solver: ${err.message}`);
    }
  },
  rerenderStep() { paintStep(); },
  goto(id) {
    if (this.step === id) { paintStep(); return; }
    destroyCalibrate();
    destroyDrawing();
    this.step = id;
    paintStepper();
    paintStep();
  },
  toast(msg) {
    const node = document.getElementById('toast');
    node.textContent = msg;
    clearTimeout(node._t);
    node._t = setTimeout(() => { node.textContent = ''; }, 6000);
  },
  setStatus(text) { document.getElementById('status-left').textContent = text; },
  showError,
  dismissError,
};

function setStatusRight(text) { document.getElementById('status-right').textContent = text; }

// ---------------------------------------------------------------------------
// The error strip
// ---------------------------------------------------------------------------
//
// FOR THE NEXT WORKSTREAM — this is the replacement for `app.toast` on
// anything that failed. Field-test finding: a toast that says "could not read
// that image" and vanishes after six seconds is a dead end; the user is left
// staring at an empty drop zone with no idea what to do. Errors stay on screen
// until dismissed, they name the file, and they carry the fix.
//
//   showError({ key, title, detail, fix, fileName, actions })
//     key       optional string; re-showing the same key REPLACES the entry
//               instead of stacking (so a Retry that fails again does not
//               grow a pile). Defaults to the title.
//     title     one short line, the sentence the user reads first.
//     detail    optional; what actually happened.
//     fix       optional; what to do about it, in imperative sentences.
//     fileName  optional; shown in mono next to the title.
//     actions   optional [{ label, onClick }] — e.g. { label: 'Retry', ... }.
//               An action that succeeds should dismissError(key) itself.
//   dismissError(key) / clearErrors()
//
// Two ways in, and the first one is better: every step module already gets the
// `app` object, and `app.showError(...)` / `app.dismissError(key)` are on it —
// no import, no import cycle. Importing { showError } from './steps.js'
// directly also works (these are hoisted function declarations, so the cycle
// steps -> drawing -> steps resolves), but there is no reason to.
//
// Styles are inline on purpose: index.html carries the phase-2 stylesheet and
// this component has to be droppable into it without touching that file. It
// uses the same CSS variables as everything else, so it themes with the app.
//
// Toasts remain the right thing for transient good news ("autosaved").

const ERR_KEYS = new Map();

function errorStripHost() {
  let host = document.getElementById('error-strip');
  if (!host) {
    host = el('div', { id: 'error-strip', style: 'display:grid;gap:8px;padding:10px 18px 0' });
    const main = document.querySelector('main');
    main.parentNode.insertBefore(host, main);
  }
  return host;
}

export function showError({
  key, title, detail, fix, fileName, actions,
} = {}) {
  const host = errorStripHost();
  const id = key || title || 'error';
  const box = el('div', {
    role: 'alert',
    style: 'border:1px solid var(--bad);border-left-width:4px;background:var(--bad-soft);'
      + 'color:#6d2320;border-radius:3px;padding:10px 12px;display:grid;gap:5px',
  });
  const head = el('div', { class: 'row' });
  head.append(el('strong', {}, title || 'Something went wrong'));
  if (fileName) head.append(el('span', { class: 'mono', style: 'font-size:12px;opacity:.85' }, fileName));
  box.append(head);
  if (detail) box.append(el('div', { style: 'font-size:13px' }, detail));
  if (fix) box.append(el('div', { style: 'font-size:13px' }, fix));

  const row = el('div', { class: 'row' });
  for (const a of actions || []) {
    const b = el('button', { class: 'tiny' }, a.label);
    b.onclick = () => a.onClick();
    row.append(b);
  }
  const close = el('button', { class: 'tiny ghost' }, 'Dismiss');
  close.onclick = () => dismissError(id);
  row.append(close);
  box.append(row);

  dismissError(id);
  ERR_KEYS.set(id, box);
  host.append(box);
  return id;
}

export function dismissError(key) {
  const node = ERR_KEYS.get(key);
  if (node) {
    node.remove();
    ERR_KEYS.delete(key);
  }
}

export function clearErrors() {
  for (const key of [...ERR_KEYS.keys()]) dismissError(key);
}

function safeStorage() {
  try { return window.localStorage; } catch (err) { return null; }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const restored = loadLocal(safeStorage());
  app.project = restored || createProject();
  await useTemplate(app.project.template, { keepStickCount: true });

  document.getElementById('project-name').value = app.project.name;
  document.getElementById('project-name').oninput = (e) => {
    app.project.name = e.target.value;
    app.commit();
  };
  document.getElementById('btn-save').onclick = () => saveProjectFile();
  document.getElementById('btn-open').onclick = () => document.getElementById('file-import').click();
  document.getElementById('file-import').onchange = (e) => openProjectFile(e.target.files[0]);
  document.getElementById('btn-reset').onclick = () => {
    if (!window.confirm('Throw away this project and start over?')) return;
    clearLocal(safeStorage());
    app.project = createProject();
    app.images = { front: null, side: null, top: null, topRect: null };
    document.getElementById('project-name').value = '';
    useTemplate(app.project.template, { keepStickCount: false }).then(() => app.goto('photos'));
  };

  window.addEventListener('keydown', onKey);
  paintStepper();
  paintStep();
  if (restored) {
    const missing = ['front', 'side', 'top'].filter((v) => app.project.views[v].present);
    app.toast(missing.length
      ? `Project restored. Re-attach ${missing.join(', ')} on the Photos step — photos are never saved to this browser’s storage.`
      : 'Project restored.');
  }
}

async function useTemplate(id, { keepStickCount }) {
  try {
    app.templateRaw = await loadTemplateSpec(id);
  } catch (err) {
    app.toast(err.message);
    return;
  }
  app.template = templateInUnits(app.templateRaw, app.project.units);
  if (!keepStickCount) {
    const meta = TEMPLATE_META.find((m) => m.id === id);
    app.project.stickCount = meta ? meta.defaultSticks : app.templateRaw.sticks.count;
  }
  app.commit();
  paintStep();
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function stepAvailable(id) {
  const v = app.project.views;
  const anyPhoto = v.front.present || v.side.present || v.top.present;
  const anyCalibrated = ['front', 'side', 'top']
    .some((k) => v[k].present && viewCalibration(app.project, k).ok);
  if (id === 'calibrate') return anyPhoto;
  if (id === 'landmarks') return anyCalibrated;
  return true;
}

function stepDone(id) {
  const v = app.project.views;
  if (id === 'photos') return v.front.present && v.side.present;
  if (id === 'calibrate') {
    const present = ['front', 'side', 'top'].filter((k) => v[k].present);
    return present.length > 0 && present.every((k) => viewCalibration(app.project, k).ok);
  }
  if (id === 'landmarks') {
    if (!app.template) return false;
    return ['front', 'side', 'top']
      .filter((k) => v[k].present)
      .every((k) => {
        const p = progress(app.project, app.template, k);
        return p.required > 0 && p.requiredPlaced === p.required;
      });
  }
  if (id === 'spec') return Object.keys(app.project.pins).length > 0;
  return false;
}

function paintStepper() {
  const nav = document.getElementById('stepper');
  nav.textContent = '';
  STEPS.forEach((s, i) => {
    const b = el('button', { class: stepDone(s.id) ? 'done' : '' },
      el('span', { class: 'n' }, String(i + 1)), s.label);
    // The measured count rides on the Spec tab, so the number is in front of
    // the user before they ever open the step (ANNOTATOR.md, phase 3b).
    if (s.id === 'spec' && app.solved && app.solved.trust) {
      const chip = trustChip(app.solved.trust);
      if (chip) b.append(chip);
    }
    if (s.id === app.step) b.setAttribute('aria-current', 'true');
    b.disabled = !stepAvailable(s.id);
    b.onclick = () => app.goto(s.id);
    nav.append(b);
  });
}

function paintStep() {
  for (const s of STEPS) {
    document.getElementById(s.root).classList.toggle('active', s.id === app.step);
  }
  const root = document.getElementById(STEPS.find((s) => s.id === app.step).root);
  if (app.step === 'photos') renderPhotos(app, root);
  else if (app.step === 'calibrate') renderCalibrate(app, root);
  else if (app.step === 'landmarks') renderLandmarks(app, root);
  else if (app.step === 'spec') renderSpec(app, root);
  else if (app.step === 'drawing') renderDrawing(app, root);
}

// ---------------------------------------------------------------------------
// Project file I/O
// ---------------------------------------------------------------------------

function saveProjectFile() {
  const { payload } = exportProject(app.project);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${projectSlug(app.project)}-project.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  app.toast('Project saved. Photos are not included — use the Drawing step if you want them embedded.');
}

async function openProjectFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const { project, images, warnings } = importProject(JSON.parse(text));
    app.project = project;
    app.images = { front: null, side: null, top: null, topRect: null };
    clearErrors();
    document.getElementById('project-name').value = project.name;
    await useTemplate(project.template, { keepStickCount: true });
    for (const [id, entry] of Object.entries(images)) {
      // eslint-disable-next-line no-await-in-loop
      await attachDataUrl(id, entry.dataUrl, entry.name);
    }
    app.commit();
    app.goto('photos');
    if (warnings.length) app.toast(warnings[0]);
  } catch (err) {
    showError({
      key: 'open-project',
      title: 'That project file would not open.',
      detail: err.message,
      fileName: file.name,
      fix: 'It should be the project.json this app saved. A renamed spec or a partly-downloaded '
        + 'file will fail here.',
    });
  }
  document.getElementById('file-import').value = '';
}

async function attachDataUrl(viewId, dataUrl, name) {
  const res = await fetch(dataUrl);          // data: URL — nothing leaves the browser
  const blob = await res.blob();
  const file = new File([blob], name || 'photo', { type: blob.type });
  // A project file's photos arrive WITH the clicks that were made on them, so
  // they are a restore, not a swap — the embedded copy is downscaled and would
  // never match on dimensions.
  await attachPhoto(viewId, file, { silent: true, restore: true });
}

// ---------------------------------------------------------------------------
// Photo intake
// ---------------------------------------------------------------------------

/**
 * Attach a photo to a view: decode (EXIF-upright, HEIC named), register it,
 * then look for the printed marker sheet in the background.
 *
 * Detection is deliberately NOT awaited. It costs a WASM load plus a detect
 * pass, and nothing about the app should wait on an assist — the photo is
 * usable the moment it decodes.
 *
 * `restore: true` means the photo is coming back out of a project file, where
 * the clicks and the photo were saved together and belong together (the
 * embedded copy is downscaled, so it will never match on dimensions).
 */
async function attachPhoto(viewId, file, { silent = false, restore = false } = {}) {
  const view = app.project.views[viewId];
  const errKey = `photo:${viewId}`;
  dismissError(errKey);
  dismissError(`marker:${viewId}`);
  dismissError(`swap:${viewId}`);

  if (file && file.type && !file.type.startsWith('image/') && !/\.hei[cf]$/i.test(file.name || '')) {
    showError({
      key: errKey,
      title: 'That does not look like an image file.',
      fileName: file.name,
      fix: 'Attach a JPEG or PNG photo of the chair.',
    });
    return false;
  }

  let photo;
  try {
    photo = await decodePhoto(file);
  } catch (err) {
    showError({
      key: errKey,
      title: err.message,
      fileName: err.fileName,
      fix: err.fix,
    });
    return false;
  }

  // A different photo takes its predecessor's clicks with it (store.js). The
  // decision is made BEFORE the view's metadata is overwritten, because the old
  // name and size are what it is made from.
  const previousName = view.imageName;
  const keepWork = restore || isSamePhoto(view, photo);
  const cleared = keepWork ? null : clearViewWork(view);

  app.images[viewId] = {
    bitmap: photo.bitmap, width: photo.width, height: photo.height, name: photo.name,
  };
  if (viewId === 'top') app.images.topRect = null;
  view.present = true;
  view.imageName = photo.name;
  view.imageWidth = photo.width;
  view.imageHeight = photo.height;
  view.markerCal = emptyResult();
  app.commit();
  paintStep();
  if (cleared && cleared.any) {
    const gone = [
      cleared.calibration ? 'the calibration' : null,
      cleared.landmarks ? `${cleared.landmarks} landmark${cleared.landmarks === 1 ? '' : 's'}` : null,
      cleared.traces ? `${cleared.traces} traced curve${cleared.traces === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(', ');
    showError({
      key: `swap:${viewId}`,
      title: `New photo — cleared the old photo’s clicks for this view (${gone}).`,
      fileName: photo.name,
      detail: `Every click on the ${plainViewLabel(viewId)} view was a position in ${previousName ? `“${previousName}”` : 'the photo before this one'}, and this is a different photo, so they would have measured whatever now sits under those pixels.`,
      fix: 'Calibrate this view again and re-place its landmarks. If you meant to re-attach the SAME photo, attach the original file — matching name and pixel size keep every click.',
    });
  }
  if (!silent && photo.exifOrientation && photo.exifOrientation !== 1) {
    app.toast(`“${photo.name}” carried EXIF orientation ${photo.exifOrientation}; it was turned upright before anything was measured.`);
  }
  detectMarkerSheet(viewId);
  return true;
}

/**
 * The vendored AprilTag WASM is ~120 KB and only worth loading once a photo
 * exists. The promise is dropped on failure so a Retry really retries — a
 * memoised rejection is the bug that makes "Retry" a lie.
 */
let detectorPromise = null;
let detectorAttempt = 0;
function getDetector() {
  if (!detectorPromise) {
    // The `?retry=` is not decoration: a browser caches a module specifier whose
    // fetch FAILED for the life of the document, so re-importing the same
    // specifier hands back the same failure and Retry never recovers, however
    // healthy the server has become. A new specifier is a new fetch.
    const spec = detectorAttempt === 0
      ? '../../marker/detect.js'
      : `../../marker/detect.js?retry=${detectorAttempt}`;
    detectorPromise = import(spec)
      .then((mod) => mod.createDetector())
      .catch((err) => { detectorPromise = null; detectorAttempt += 1; throw err; });
  }
  return detectorPromise;
}

const plainViewLabel = (id) => VIEW_LABEL[id].replace(' (rectified)', '').toLowerCase();

/** Downscaled Rec.601 luma, which is all the detector wants. */
function grayscaleFrom(bitmap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j += 1) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return gray;
}

async function detectMarkerSheet(viewId) {
  const errKey = `marker:${viewId}`;
  const img = app.images[viewId];
  const view = app.project.views[viewId];
  if (!img) return;
  dismissError(errKey);
  app.setStatus(`Looking for the printed sheet in the ${plainViewLabel(viewId)} photo…`);
  try {
    const plan = planDetectionDownscale(img.width, img.height);
    const gray = grayscaleFrom(img.bitmap, plan.width, plan.height);
    const detector = await getDetector();
    const detections = detector.detect(gray, plan.width, plan.height);
    const variant = variantForIds(detections.map((d) => d.id));
    if (!variant) {
      view.markerCal = noSheetResult();
      app.setStatus('No printed sheet in that photo — calibrate this view by hand.');
    } else {
      const manifest = await loadManifest(variant);
      view.markerCal = calibrateView(viewId, detections, manifest, {
        imageScale: plan.scale,
        ruler: app.project.ruler,
      });
      const mc = view.markerCal;
      if (mc.status === 'used') {
        if (viewId === 'top') applyMarkerQuad(app);
        else applyElevationPrefill(view, mc);
        app.setStatus(`Printed ${variant} sheet found: ${mc.found} of 4 tags, `
          + `${mc.residualMm.toFixed(2)} mm fit — calibration prefilled.`);
      } else {
        app.setStatus(`Printed sheet found but not trusted — ${mc.reason}.`);
      }
    }
    app.commit();
    paintStep();
  } catch (err) {
    showError({
      key: errKey,
      title: `Could not check the ${plainViewLabel(viewId)} photo for a printed sheet.`,
      detail: err.message,
      fileName: view.imageName,
      fix: 'Nothing is lost — calibrate this view by hand; the sheet only saves clicks. '
        + 'If this app is open from a file:// path, the detector cannot load its WASM; '
        + 'serve the folder over http instead (python3 -m http.server).',
      actions: [{ label: 'Retry', onClick: () => detectMarkerSheet(viewId) }],
    });
  }
}

/**
 * The typed ruler measurement changes what the printed millimetres are worth,
 * so any scale this app prefilled has to follow it. A scale the user has since
 * moved is left alone: the points no longer match what the sheet said, which
 * means they own it now.
 */
async function refreshMarkerScale() {
  for (const viewId of ['front', 'side']) {
    const view = app.project.views[viewId];
    const mc = view.markerCal;
    if (!mc || mc.status !== 'used' || !mc.scaleLine || !mc.variant) continue;
    let manifest;
    try {
      // eslint-disable-next-line no-await-in-loop
      manifest = await loadManifest(mc.variant);
    } catch (err) {
      continue;   // the typed value is still stored; nothing here is destructive
    }
    const before = mc.scaleLine.valueMm;
    const after = datumLengthMm(manifest, app.project.ruler);
    mc.scaleLine.valueMm = after;
    const s = view.calib.scale;
    const same = s.a && s.b
      && s.a.x === mc.scaleLine.a.x && s.a.y === mc.scaleLine.a.y
      && s.b.x === mc.scaleLine.b.x && s.b.y === mc.scaleLine.b.y
      && s.unit === 'mm' && s.value === before;
    if (same) s.value = after;
  }
  app.commit();
  paintStep();
}

// ---------------------------------------------------------------------------
// Step 1 — Photos
// ---------------------------------------------------------------------------

const CAPTURE_COPY = [
  'Front and side are required. Stand square to the chair, 3–4 m back, and zoom in rather than stepping closer — perspective comes from distance, not focal length. Get the whole chair and the floor under its feet in frame, against a plain or backlit background.',
  'Top is optional but it is the only view that sees the seat plan and the mortise positions. Lay a sheet of paper flat on the seat, square to the seat’s front edge, and shoot straight down with your phone’s grid and level turned on.',
];

function renderPhotos(a, root) {
  root.textContent = '';
  root.append(el('h2', {}, 'Photos'));
  root.append(el('p', { class: 'lede' },
    'Start from the closest template, then hand over your photos. Nothing is uploaded — every pixel stays in this browser.'));

  const tpl = el('div', { class: 'panel' });
  tpl.append(el('h3', {}, 'Template'));
  const grid = el('div', { class: 'templates' });
  for (const meta of TEMPLATE_META) {
    const sel = a.project.template === meta.id;
    const lab = el('label', { class: sel ? 'sel' : '' });
    const radio = el('input', { type: 'radio', name: 'template' });
    radio.checked = sel;
    radio.onchange = () => {
      a.project.template = meta.id;
      useTemplate(meta.id, { keepStickCount: false });
    };
    lab.append(el('div', {}, radio, el('strong', {}, meta.label)));
    lab.append(el('div', { class: 'blurb' }, meta.blurb));
    grid.append(lab);
  }
  tpl.append(grid);

  const opts = el('div', { class: 'row', style: 'margin-top:12px' });
  const units = el('select', {});
  for (const [u, txt] of [['in', 'inches'], ['mm', 'millimetres']]) {
    const o = el('option', { value: u }, txt);
    if (a.project.units === u) o.selected = true;
    units.append(o);
  }
  units.onchange = () => {
    // Not a display preference: everything unit-bearing in the project moves
    // with the flag, in one step, so the project is never half in inches and
    // half in millimetres. See convertProjectUnits — it converts the pins and
    // rescales each view's rectified pixels-per-unit, which leaves the
    // rectified canvas and every click on it exactly where they were.
    convertProjectUnits(a.project, units.value);
    a.template = templateInUnits(a.templateRaw, a.project.units);
    a.commit();
    paintStep();
  };
  opts.append(el('label', { class: 'field', style: 'margin:0' }, el('span', { style: 'min-width:0' }, 'Units'), units));

  const sticks = el('input', { type: 'number', min: '2', max: '40', step: '1', style: 'width:70px', value: String(a.project.stickCount) });
  sticks.onchange = () => {
    const v = Math.max(2, Math.round(Number(sticks.value) || 2));
    a.project.stickCount = v;
    // Touching this control is an ANSWER about the chair, and the badge and the
    // trust count say so from here on. Inheriting the template's number is not.
    a.project.stickCountAnswered = true;
    sticks.value = String(v);
    a.commit();
  };
  opts.append(el('label', { class: 'field', style: 'margin:0' }, el('span', { style: 'min-width:0' }, 'Back sticks'), sticks));
  tpl.append(opts);
  tpl.append(el('p', { class: 'hint' }, 'Count the sticks in the back — the app cannot see them reliably, and the spacing is derived from the count.'));
  root.append(tpl);

  root.append(questionsPanel(a));
  root.append(markerSheetPanel(a));

  const shots = el('div', { class: 'panel' });
  shots.append(el('h3', {}, 'How to shoot it'));
  for (const line of CAPTURE_COPY) shots.append(el('p', { class: 'hint strong' }, line));
  root.append(shots);

  const drops = el('div', { class: 'panel' });
  drops.append(el('h3', {}, 'Photos'));
  const row = el('div', { class: 'drops' });
  for (const id of ['front', 'side', 'top']) row.append(dropZone(a, id));
  drops.append(row);
  root.append(drops);

  const go = el('div', { class: 'row', style: 'margin-top:14px' });
  const next = el('button', { class: 'primary' }, 'Calibrate →');
  next.disabled = !stepAvailable('calibrate');
  next.onclick = () => a.goto('calibrate');
  go.append(next);
  if (!a.project.views.front.present || !a.project.views.side.present) {
    go.append(el('span', { class: 'hint' }, 'Front and side are required; top is optional.'));
  }
  root.append(go);
}

/**
 * The two questions a photo cannot answer.
 *
 * Field-test finding: picking a template silently decided the chair had a
 * one-piece crest and through tenons, and the Drawing step then presented
 * those template facts as if they had been measured. These are asked instead,
 * and left UNANSWERED until the user answers — an unanswered question keeps
 * the template's value AND keeps the trust surface honest about it.
 */
function questionsPanel(a) {
  const p = a.project;
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'About your chair'));
  panel.append(el('p', { class: 'hint' },
    'Two things the app cannot see in a photo. Whatever you answer overrides the template; '
    + 'leave one unanswered and the template’s own answer stands.'));

  const armRow = el('label', { class: 'field' });
  armRow.append(el('span', {}, 'Arms'));
  const arms = el('select', {});
  for (const [v, txt] of [['', '— not answered —'], ['none', 'No arms'], ['armbow', 'A continuous arm bow']]) {
    const o = el('option', { value: v }, txt);
    if ((p.armStyle || '') === v) o.selected = true;
    arms.append(o);
  }
  arms.onchange = () => {
    p.armStyle = arms.value || null;
    if (p.armStyle !== 'armbow') p.armSpindleCount = null;
    a.commit();
    paintStep();
  };
  armRow.append(arms);
  panel.append(armRow);

  if (p.armStyle === 'armbow') {
    const spRow = el('label', { class: 'field' });
    spRow.append(el('span', {}, 'Bow spindles'));
    const sp = el('input', {
      type: 'number', min: '0', max: '40', step: '1', style: 'width:70px',
      value: p.armSpindleCount === null ? '' : String(p.armSpindleCount),
    });
    sp.onchange = () => {
      const v = Number(sp.value);
      p.armSpindleCount = Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
      sp.value = p.armSpindleCount === null ? '' : String(p.armSpindleCount);
      a.commit();
    };
    spRow.append(sp);
    panel.append(spRow);
    panel.append(el('p', { class: 'hint' },
      'Count the short sticks between the seat and the arm bow, both sides together.'));
  }

  const tenonRow = el('label', { class: 'field' });
  tenonRow.append(el('span', {}, 'Crest tenons'));
  const tenons = el('select', {});
  for (const [v, txt] of [['', '— not answered —'], ['through', 'Through, wedged on top'], ['blind', 'Blind — stopped inside']]) {
    const o = el('option', { value: v }, txt);
    if ((p.crestTenons || '') === v) o.selected = true;
    tenons.append(o);
  }
  tenons.onchange = () => {
    p.crestTenons = tenons.value || null;
    a.commit();
    paintStep();
  };
  tenonRow.append(tenons);
  panel.append(tenonRow);
  panel.append(el('p', { class: 'hint' },
    'Look at the top of the crest: wedge lines across each stick mean through tenons; a clean '
    + 'unbroken top means blind.'));
  return panel;
}

/** Print-the-sheet links and the verification-bar measurement. */
function markerSheetPanel(a) {
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Printed marker sheet — optional, and it does the calibrating'));
  panel.append(el('p', { class: 'hint strong' },
    'Print one page, lay it on the floor under the chair with the SEAT FRONT line below the seat’s '
    + 'front edge, and it sets the scale and the floor line for you. Lay it on the seat for the top '
    + 'view and the app rectifies that photo with no clicks at all.'));

  const links = el('div', { class: 'row' });
  for (const [variant, txt] of [['letter', 'US Letter sheet (SVG)'], ['a4', 'A4 sheet (SVG)']]) {
    links.append(el('a', {
      class: 'btn', href: sheetUrl(variant).href, target: '_blank', rel: 'noopener',
    }, txt));
  }
  panel.append(links);
  panel.append(el('p', { class: 'hint' },
    'Print at 100% — never “fit to page”. Then measure the verification bar on your print: if it '
    + 'is not exactly right, type what you measured and every reading follows it.'));

  const row = el('label', { class: 'field' });
  row.append(el('span', {}, 'Bar measures'));
  const input = el('input', {
    type: 'number', step: '0.1', min: '0', style: 'width:90px',
    value: a.project.ruler.value === null ? '' : String(a.project.ruler.value),
  });
  input.oninput = () => {
    const v = Number(input.value);
    a.project.ruler.value = Number.isFinite(v) && v > 0 ? v : null;
    a.commit();
  };
  input.onchange = () => refreshMarkerScale();
  const unit = el('select', {});
  for (const [u, txt] of [['mm', 'mm (the 100 mm bar)'], ['in', 'in (the 4 in bar)']]) {
    const o = el('option', { value: u }, txt);
    if (a.project.ruler.unit === u) o.selected = true;
    unit.append(o);
  }
  unit.onchange = () => {
    a.project.ruler.unit = unit.value;
    a.commit();
    refreshMarkerScale();
  };
  row.append(input, unit);
  panel.append(row);

  const note = el('div', { id: 'print-scale-note' });
  panel.append(note);
  paintPrintScale(a, note);
  return panel;
}

/**
 * The live print-scale check. Async only because it needs a manifest for the
 * nominal bar length — no constant of ours goes anywhere near this number.
 */
async function paintPrintScale(a, node) {
  const value = a.project.ruler.value;
  if (!value) {
    node.append(el('p', { class: 'hint' },
      'Left blank, the app assumes your printer was honest (which it usually is, to well under a percent).'));
    return;
  }
  const variant = ['front', 'side', 'top']
    .map((v) => a.project.views[v].markerCal && a.project.views[v].markerCal.variant)
    .find(Boolean) || 'letter';
  let manifest;
  try {
    manifest = await loadManifest(variant);
  } catch (err) {
    return;
  }
  const k = rulerScale(manifest, a.project.ruler);
  node.textContent = '';
  if (!k) {
    node.append(el('div', { class: 'note warn' },
      'That is not a plausible reading for the bar — check whether you measured the 100 mm bar or the 4 in one.'));
    return;
  }
  const sign = k.pct >= 0 ? '+' : '';
  node.append(el('p', { class: 'hint strong mono' },
    `print scale ${sign}${k.pct.toFixed(2)}% (${k.measuredMm.toFixed(1)} mm measured against ${k.nominalMm} mm printed)`));
}

function dropZone(a, viewId) {
  const view = a.project.views[viewId];
  const zone = el('div', { class: 'drop' });
  const input = el('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
  zone.append(el('div', { class: 'vname' }, VIEW_LABEL[viewId].replace(' (rectified)', '')));
  zone.append(el('div', { class: 'req' }, viewId === 'top' ? 'optional' : 'required'));

  const img = a.images[viewId];
  if (img) {
    const c = el('canvas');
    const k = Math.min(200 / img.width, 118 / img.height);
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img.bitmap, 0, 0, c.width, c.height);
    zone.append(c);
    zone.append(el('div', { class: 'fname' }, `${view.imageName || 'photo'} · ${img.width}×${img.height}`));
    const mc = view.markerCal;
    if (mc && mc.status === 'used') {
      zone.append(el('div', { class: 'hint strong' },
        `printed sheet found (${mc.found}/4 tags) — ${viewId === 'top' ? 'rectified automatically' : 'scale and floor line prefilled'}`));
    } else if (mc && mc.status === 'rejected') {
      zone.append(el('div', { class: 'hint' }, `sheet found but not used — ${mc.reason}`));
    } else if (mc && mc.reason) {
      zone.append(el('div', { class: 'hint' }, 'no printed sheet in this photo — calibrate by hand'));
    }
  } else if (view.present) {
    zone.append(el('div', { class: 'note warn', style: 'text-align:left' },
      `“${view.imageName || 'photo'}” is referenced by this project but not loaded. Attach the same file to keep every click.`));
  } else {
    zone.append(el('div', { class: 'hint' }, 'Drop a photo here'));
  }

  const pick = el('button', {}, img ? 'Replace' : 'Choose a photo');
  pick.onclick = () => input.click();
  zone.append(pick, input);

  if (img) {
    const rm = el('button', { class: 'ghost tiny' }, 'Remove');
    rm.onclick = () => {
      a.images[viewId] = null;
      if (viewId === 'top') a.images.topRect = null;
      view.present = false;
      view.imageName = null;
      view.markerCal = emptyResult();
      dismissError(`photo:${viewId}`);
      dismissError(`marker:${viewId}`);
      a.commit();
      paintStep();
    };
    zone.append(rm);
  }

  const load = (file) => {
    if (!file) return;
    attachPhoto(viewId, file);
  };

  input.onchange = () => load(input.files[0]);
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    load(e.dataTransfer.files[0]);
  };
  return zone;
}

// ---------------------------------------------------------------------------
// Step 3 — Landmarks
// ---------------------------------------------------------------------------

const lm = {
  viewId: null,
  current: null,     // landmark id the prompt is asking for
  selected: null,    // landmark id (or `trace:<curve>:<i>`) under the keyboard
  trace: null,       // the curve being traced right now, or null
  vp: null,
  ghosts: {},
  vpState: {},       // pan/zoom per view, kept across re-renders
};

const isTraceId = (id) => typeof id === 'string' && id.startsWith('trace:');
const traceRef = (id) => {
  const [, curve, index] = id.split(':');
  return { curve, index: Number(index) };
};

function renderLandmarks(a, root) {
  root.textContent = '';
  root.append(el('h2', {}, 'Landmarks'));
  root.append(el('p', { class: 'lede' },
    'One click at a time. The faint dots are where the template expects each point — grab one and drag it onto your chair rather than clicking cold.'));

  const views = ['front', 'side', 'top']
    .filter((v) => a.project.views[v].present && viewCalibration(a.project, v).ok);
  if (!views.length) {
    root.append(el('div', { class: 'note warn' }, 'Calibrate a view first.'));
    return;
  }
  if (!lm.viewId || !views.includes(lm.viewId)) { lm.viewId = views[0]; lm.current = null; }
  root.append(viewTabs(views, lm.viewId, VIEW_LABEL, (id) => {
    lm.viewId = id;
    lm.current = null;
    lm.selected = null;
    paintStep();
  }));

  const viewId = lm.viewId;
  const view = a.project.views[viewId];
  const items = scheduleForView(a.project, a.template, viewId);
  const traces = traceSpecsForView(a.project, a.template, viewId);
  if (lm.trace && !traces.some((t) => t.id === lm.trace)) lm.trace = null;
  if (!lm.current || !items.some((i) => i.id === lm.current)) {
    const next = nextUnplaced(items, a.project, 0);
    lm.current = next ? next.id : (items[0] && items[0].id);
  }
  lm.ghosts = seedLandmarks(a.project, a.template, viewId);

  const cols = el('div', { class: 'cols canvas' });
  const left = el('div', {});
  const right = el('div', {});
  cols.append(left, right);
  root.append(cols);

  const item = items.find((i) => i.id === lm.current);
  const active = lm.trace ? traces.find((t) => t.id === lm.trace) : null;
  const prompt = el('div', { class: 'prompt-box' });
  if (active) {
    const st = traceStatus(a.project, viewId, active);
    prompt.append(el('div', { class: 'p' }, active.prompt));
    prompt.append(el('div', { class: 'k' },
      `${st.count} of ${active.min}–${active.max} points · Enter or Esc when the curve is done · `
      + 'Backspace drops the last point · drag any point to adjust it · arrows nudge'));
  } else {
    prompt.append(el('div', { class: 'p' }, item ? item.prompt : 'Every landmark in this view is placed.'));
    prompt.append(el('div', { class: 'k' },
      'Enter / N next · Backspace unplace · arrows nudge 0.5 px (Shift 5) · space-drag or two fingers to pan · wheel or pinch to zoom'));
  }
  left.append(prompt);

  const wrap = el('div', { class: 'viewport-wrap' });
  const canvas = el('canvas');
  wrap.append(canvas);
  left.append(wrap);

  const p = progress(a.project, a.template, viewId);
  const sched = el('div', { class: 'panel' });
  sched.append(el('h3', {}, `Schedule — ${p.requiredPlaced}/${p.required} required`));
  const ol = el('ol', { class: 'sched' });
  for (const it of items) {
    const placed = isPlaced(a.project, it.id);
    const seeded = placed && isSeeded(a.project, it.id);
    const li = el('li', { class: `${placed ? 'placed' : ''} ${it.id === lm.current ? 'cur' : ''}` });
    const d = el('span', { class: `dot ${placed ? '' : 'empty'}` });
    d.style.background = GROUPS[it.group].color;
    d.style.borderColor = GROUPS[it.group].color;
    li.append(d);
    li.append(el('span', { class: 'nm' }, humanName(it.id)));
    // A point still sitting where the template put it counts as placed — there
    // is something to solve with — but it is not a reading off this chair, and
    // the row says which of the two it is rather than leaving it to the count
    // three steps later.
    if (seeded) {
      li.append(el('span', {
        class: 'opt',
        title: 'This is the template’s position, not a measurement. Drag or nudge it onto your chair and it becomes yours.',
      }, 'template'));
    }
    if (it.optional) li.append(el('span', { class: 'opt' }, 'optional'));
    li.onclick = () => { lm.current = it.id; lm.selected = placed ? it.id : null; paintStep(); };
    ol.append(li);
  }
  sched.append(ol);

  const btns = el('div', { class: 'row', style: 'margin-top:10px' });
  const skip = el('button', { class: 'tiny' }, 'Skip this one');
  skip.onclick = () => { advance(a, items); };
  const seedAll = el('button', { class: 'tiny' }, 'Accept all template positions');
  seedAll.onclick = () => {
    // seedLandmarks stamps every point 'seeded' (store.js): accepting the
    // template's position gives the solver something to work from, and gives
    // the trust count nothing. The hint under this button has always said so;
    // until now the count next to it said the opposite.
    Object.assign(view.landmarks, seedLandmarks(a.project, a.template, viewId));
    a.commit();
    paintStep();
  };
  const clear = el('button', { class: 'tiny' }, 'Clear this view');
  clear.onclick = () => {
    view.landmarks = {};
    view.traces = {};            // "this view" means everything clicked in it
    lm.selected = null;
    lm.trace = null;
    a.commit();
    paintStep();
  };
  btns.append(skip, seedAll, clear);
  sched.append(btns);
  sched.append(el('p', { class: 'hint' },
    'Accepting a template position records the template’s own number — useful for a part the photo cannot see, but it is not a measurement, '
    + 'and everything it feeds stays marked “template position” on the Spec step and out of the measured count. '
    + 'Drag or nudge one and it becomes yours.'));
  right.append(sched);

  if (traces.length) right.append(tracePanel(a, viewId, traces));

  if (a.solved) {
    const feed = el('div', { class: 'panel' });
    feed.append(el('h3', {}, 'Solving so far'));
    const list = el('div', {});
    for (const [key, r] of Object.entries(a.solved.values)) {
      list.append(el('div', { class: 'row', style: 'justify-content:space-between' },
        el('span', { class: 'hint strong' }, key),
        el('span', { class: 'mono' }, `${round3(r.value)} ${a.project.units}`)));
    }
    if (!Object.keys(a.solved.values).length) list.append(el('p', { class: 'hint' }, 'Nothing measured yet.'));
    feed.append(list);
    right.append(feed);
  }

  const image = viewId === 'top' ? ensureRectified(a) : a.images[viewId];
  if (!image) {
    wrap.append(el('div', { class: 'vp-empty' }, 'This view has no image loaded.'));
    return;
  }

  if (lm.vp) {
    lm.vpState[lm.vp._viewId] = lm.vp.saveState();
    lm.vp.destroy();
  }
  lm.vp = new Viewport(canvas, landmarkHandlers(a, viewId, items, traces));
  lm.vp._viewId = viewId;
  lm.vp.setImage(image.bitmap, image.width, image.height);
  lm.vp.restoreState(lm.vpState[viewId]);
}

/**
 * Curve tracing — the same clicks, several at a time.
 *
 * ANNOTATOR.md phase 3b: a curved comb, a steam-bent armbow and a shaped seat
 * have no landmark that describes them, so they are TRACED instead. The points
 * are stored exactly as clicked and keep every affordance a landmark has (drag,
 * nudge, loupe); the only new thing here is the circle-fit assist, which is
 * offered as a button and never applied on its own.
 */
function tracePanel(a, viewId, traces) {
  const view = a.project.views[viewId];
  const cal = viewCalibration(a.project, viewId);
  const units = a.project.units;
  const panel = el('div', { class: 'panel' });
  panel.append(el('h3', {}, 'Curves — traced, not clicked'));
  panel.append(el('p', { class: 'hint' },
    'Optional. Trace one and it replaces the template’s straight comb, its rectangular seat or its default bow with what your chair actually does.'));

  for (const spec of traces) {
    const st = traceStatus(a.project, viewId, spec);
    const row = el('div', { style: 'padding:7px 0;border-top:1px solid var(--rule)' });
    const head = el('div', { class: 'row', style: 'justify-content:space-between' });
    const name = el('span', { class: 'hint strong' }, spec.label);
    name.style.color = GROUPS[spec.group].color;
    head.append(name, el('span', { class: 'mono', style: 'font-size:12px' }, st.text));
    row.append(head);

    const measure = traceMeasure(st.points, cal.ok ? cal.pxPerUnit : 0, { closed: spec.closed });
    if (measure) {
      row.append(el('div', { class: 'hint mono' }, spec.closed
        ? `around: ${round3(measure.along)} ${units}`
        : `along: ${round3(measure.along)} ${units} · chord: ${round3(measure.chord)} ${units}`));
    }

    const btns = el('div', { class: 'row', style: 'margin-top:5px' });
    const tracing = lm.trace === spec.id;
    const go = el('button', { class: 'tiny' }, tracing ? 'Done' : (st.count ? 'Keep tracing' : 'Trace it'));
    go.onclick = () => {
      lm.trace = tracing ? null : spec.id;
      lm.selected = null;
      paintStep();
    };
    btns.append(go);
    if (st.count) {
      const undo = el('button', { class: 'tiny ghost' }, 'Undo point');
      undo.onclick = () => {
        view.traces[spec.id] = st.points.slice(0, -1);
        if (!view.traces[spec.id].length) delete view.traces[spec.id];
        a.commit();
        paintStep();
      };
      const clear = el('button', { class: 'tiny ghost' }, 'Clear');
      clear.onclick = () => {
        delete view.traces[spec.id];
        a.commit();
        paintStep();
      };
      btns.append(undo, clear);
    }
    row.append(btns);

    // The assist. Offered only when a single circle genuinely fits the clicks
    // inside the renderer's own 1/16 in band — the same test that decides
    // whether the drawing prints a radius or "varies".
    if (!spec.closed && cal.ok && st.count >= 3) {
      const fit = arcAssist(st.points, cal.pxPerUnit, units);
      if (fit && fit.fits) {
        const snap = el('button', { class: 'tiny' }, `Snap to arc (R ${round3(fit.radiusUnits)} ${units})`);
        snap.onclick = () => {
          view.traces[spec.id] = snapToArc(st.points, fit.circle);
          a.commit();
          paintStep();
        };
        const box = el('div', { class: 'row', style: 'margin-top:5px' });
        box.append(snap);
        row.append(box);
        row.append(el('p', { class: 'hint' },
          `Your clicks sit within ${round3(fit.deviationUnits)} ${units} of one arc. Snapping trues them up to it — your call, not the app’s.`));
      } else if (fit) {
        row.append(el('p', { class: 'hint' },
          `No single arc fits these clicks (off by ${round3(fit.deviationUnits)} ${units}) — the drawing will label this curve “varies”.`));
      }
    }
    row.append(el('p', { class: 'hint' }, spec.hint));
    panel.append(row);
  }

  if (!cal.ok) {
    panel.append(el('div', { class: 'note warn' },
      'This view is not calibrated yet, so a traced curve has no size. Calibrate first.'));
  }
  return panel;
}

function landmarkHandlers(a, viewId, items, traces = []) {
  const view = a.project.views[viewId];
  const tracePts = (id) => {
    if (!view.traces) view.traces = {};
    if (!Array.isArray(view.traces[id])) view.traces[id] = [];
    return view.traces[id];
  };
  return {
    hitTest(p, tol) {
      let best = null;
      let bestD = tol;
      for (const it of items) {
        const q = view.landmarks[it.id] || lm.ghosts[it.id];
        if (!q) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= bestD) { bestD = d; best = it.id; }
      }
      // Traced points come second so an ordinary landmark still wins a tie —
      // except while tracing, when the curve under the cursor is what the user
      // means and a landmark ghost is not.
      for (const spec of traces) {
        const pts = (view.traces && view.traces[spec.id]) || [];
        pts.forEach((q, i) => {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bestD || (lm.trace === spec.id && d <= tol && !isTraceId(best))) {
            bestD = d;
            best = `trace:${spec.id}:${i}`;
          }
        });
      }
      return best;
    },
    onSelect(id) {
      if (isTraceId(id)) {
        lm.selected = id;
        lm.trace = traceRef(id).curve;
        return;
      }
      // Grabbing a ghost materialises it where the template put it — still the
      // template's coordinate, so still 'seeded'. The drag that follows is the
      // user's adjustment, and onMoveItem upgrades it to 'clicked' the moment
      // the point actually moves; letting go without moving leaves it as what
      // it is, an accepted template position.
      if (!view.landmarks[id] && lm.ghosts[id]) {
        const g = lm.ghosts[id];
        view.landmarks[id] = { x: g.x, y: g.y, source: 'seeded' };
      }
      lm.selected = id;
      lm.current = id;
    },
    onMoveItem(id, p) {
      if (isTraceId(id)) {
        const { curve, index } = traceRef(id);
        const pts = tracePts(curve);
        if (pts[index]) pts[index] = { x: p.x, y: p.y };
        return;
      }
      // Dragged by hand: whatever it was, it is the user's point now.
      view.landmarks[id] = { x: p.x, y: p.y, source: 'clicked' };
    },
    onMoveEnd() {
      a.commit();
      paintStep();
    },
    onPlace(p) {
      if (lm.trace) {
        const spec = traces.find((t) => t.id === lm.trace);
        if (!spec) return;
        const pts = tracePts(spec.id);
        if (pts.length >= spec.max) {
          a.toast(`That curve is full at ${spec.max} points — drag one instead, or clear it and start again.`);
          return;
        }
        // Two points in the same place are not a curve, and the renderer's
        // validator refuses them outright — so the UI never makes one.
        const blocked = traceClickBlock(pts, p, { closed: spec.closed });
        if (blocked) {
          a.toast(blocked === 'first'
            ? 'That click landed back on the first point — the outline closes itself, so leave a gap and stop before you reach it.'
            : 'That click landed on the last one. Move along the curve a little, or drag the existing point instead.');
          return;
        }
        pts.push({ x: p.x, y: p.y });
        lm.selected = `trace:${spec.id}:${pts.length - 1}`;
        a.commit();
        paintStep();
        return;
      }
      if (!lm.current) return;
      view.landmarks[lm.current] = { x: p.x, y: p.y, source: 'clicked' };
      lm.selected = lm.current;
      a.commit();
      advance(a, items);
    },
    onPointer(p) {
      a.setStatus(`${VIEW_LABEL[viewId]} · x ${p.x.toFixed(1)} y ${p.y.toFixed(1)} px`);
    },
    drawOverlay(ctx, v) {
      for (const spec of traces) drawTrace(ctx, v, view, spec);
      for (const it of items) {
        const placed = view.landmarks[it.id];
        const ghost = lm.ghosts[it.id];
        const q = placed || ghost;
        if (!q) continue;
        const color = GROUPS[it.group].color;
        dot(ctx, v.toScreen(q), {
          color,
          r: v.inLoupe ? 4 : (it.id === lm.current ? 6 : 5),
          ghost: !placed,
          hover: v.hoverId === it.id,
          selected: it.id === lm.selected,
        });
        if (!v.inLoupe && it.id === lm.current) {
          label(ctx, v.toScreen(q), humanName(it.id), { color });
        }
      }
      if (v.inLoupe && v.pointer) crosshair(ctx, v.toScreen(v.pointer), 'rgba(255,90,43,.9)', 7);
    },
  };
}

/** One traced curve on the canvas: the smoothed line, then the clicked points. */
function drawTrace(ctx, v, view, spec) {
  const pts = (view.traces && view.traces[spec.id]) || [];
  if (!pts.length) return;
  const color = GROUPS[spec.group].color;
  const activeCurve = lm.trace === spec.id;
  ctx.save();
  ctx.globalAlpha = activeCurve ? 1 : 0.62;
  if (pts.length >= 2) {
    const curve = tracePreview(pts, { closed: spec.closed && pts.length >= 3 });
    ctx.strokeStyle = color;
    ctx.lineWidth = activeCurve ? 2.2 : 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    curve.forEach((q, i) => {
      const s = v.toScreen(q);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    if (spec.closed && pts.length >= 3) ctx.closePath();
    ctx.stroke();
    // the raw clicks, dashed, so it is obvious what was traced and what was
    // smoothed for the drawing
    ctx.setLineDash([3, 4]);
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    pts.forEach((q, i) => {
      const s = v.toScreen(q);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    if (spec.closed && pts.length >= 3) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  pts.forEach((q, i) => {
    const id = `trace:${spec.id}:${i}`;
    dot(ctx, v.toScreen(q), {
      color,
      r: v.inLoupe ? 3.5 : (activeCurve ? 5 : 4),
      hover: v.hoverId === id,
      selected: lm.selected === id,
    });
  });
}

function advance(a, items) {
  const idx = items.findIndex((i) => i.id === lm.current);
  const next = nextUnplaced(items, a.project, idx + 1);
  lm.current = next ? next.id : lm.current;
  paintStep();
}

function onKey(e) {
  if (app.step !== 'landmarks' || isTyping(e.target)) return;
  const view = app.project.views[lm.viewId];
  if (!view) return;
  const items = scheduleForView(app.project, app.template, lm.viewId);

  // --- while tracing, the same keys mean the same things, one curve down ----
  if (lm.trace) {
    const pts = (view.traces && view.traces[lm.trace]) || [];
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      lm.trace = null;
      lm.selected = null;
      paintStep();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!pts.length) return;
      e.preventDefault();
      // the selected point if one is under the keyboard, otherwise the last
      const sel = isTraceId(lm.selected) ? traceRef(lm.selected) : null;
      const index = sel && sel.curve === lm.trace ? sel.index : pts.length - 1;
      pts.splice(index, 1);
      if (!pts.length) delete view.traces[lm.trace];
      lm.selected = null;
      app.commit();
      paintStep();
      return;
    }
  }

  if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    advance(app, items);
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const id = lm.selected || lm.current;
    if (id && !isTraceId(id) && view.landmarks[id]) {
      e.preventDefault();
      delete view.landmarks[id];
      lm.current = id;
      app.commit();
      paintStep();
    }
    return;
  }
  const deltas = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  const d = deltas[e.key];
  if (!d) return;
  const step = nudgeAmount(e.shiftKey);

  // A traced point nudges exactly like a landmark — same 0.5 px, same Shift.
  if (isTraceId(lm.selected)) {
    const { curve, index } = traceRef(lm.selected);
    const pts = (view.traces && view.traces[curve]) || [];
    const q = pts[index];
    if (!q) return;
    e.preventDefault();
    pts[index] = { x: q.x + d[0] * step, y: q.y + d[1] * step };
    app.commit();
    if (lm.vp) lm.vp.redraw();
    app.setStatus(`${curve} point ${index + 1} → x ${pts[index].x.toFixed(1)} y ${pts[index].y.toFixed(1)} px`);
    return;
  }

  const id = lm.selected || lm.current;
  const p = id && view.landmarks[id];
  if (!p) return;
  e.preventDefault();
  // A nudge is an adjustment like any other: half a pixel of the user's own
  // judgement makes the point theirs, not the template's.
  view.landmarks[id] = { x: p.x + d[0] * step, y: p.y + d[1] * step, source: 'clicked' };
  app.commit();
  if (lm.vp) lm.vp.redraw();
  app.setStatus(`${humanName(id)} → x ${view.landmarks[id].x.toFixed(1)} y ${view.landmarks[id].y.toFixed(1)} px`);
}

function humanName(id) {
  const bare = id.split('.')[1] || id;
  return bare
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function round3(v) { return Math.round(v * 1000) / 1000; }

boot();
