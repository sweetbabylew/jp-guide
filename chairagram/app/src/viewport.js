// viewport.js — the shared precision loop: pan, zoom-to-cursor, loupe, pointer
// machinery. Every clicking step in the app uses one of these.
//
// This module is DOM-heavy on purpose; it holds no chair knowledge at all. It
// speaks in "image pixels" (the working space of whatever bitmap it was given)
// and hands them to the step that owns it.
//
// Interaction contract (ANNOTATOR.md § precision loop):
//   wheel / ctrl-wheel / pinch   zoom to the cursor
//   space-drag, middle-drag,
//   two-finger drag              pan
//   single pointer               place or drag a point
//   loupe                        ~120 px circle at ~4x, follows the pointer

const LOUPE_RADIUS = 60;          // css px -> a 120 px circle
const LOUPE_FACTOR = 4;           // x the current view scale
const LOUPE_MIN_SCALE = 2;        // never show a loupe that shrinks the image
const HIT_RADIUS_CSS = 11;        // how close a click must be to grab a point

export class Viewport {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.image = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.pointer = null;         // {x, y} in image px
    this.hoverId = null;
    this.spaceDown = false;
    this.panning = false;
    this.dragId = null;
    this.dragMoved = false;
    this.pointers = new Map();
    this.pinch = null;
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        this.spaceDown = true;
        this.canvas.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      if (e.code === 'Space') { this.spaceDown = false; this.canvas.style.cursor = ''; }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('pointerleave', () => { this.pointer = null; this.redraw(); });
    canvas.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
    this._resize();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._ro.disconnect();
  }

  // --- geometry ------------------------------------------------------------

  get cssWidth() { return this.canvas.clientWidth || 1; }
  get cssHeight() { return this.canvas.clientHeight || 1; }

  toScreen(p) {
    return { x: p.x * this.scale + this.offset.x, y: p.y * this.scale + this.offset.y };
  }

  toImage(p) {
    return { x: (p.x - this.offset.x) / this.scale, y: (p.y - this.offset.y) / this.scale };
  }

  eventPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  setImage(image, width, height) {
    this.image = image;
    this.imageWidth = width || (image ? image.width : 0);
    this.imageHeight = height || (image ? image.height : 0);
    this.fit();
  }

  fit() {
    if (!this.imageWidth || !this.imageHeight) { this.redraw(); return; }
    const pad = 16;
    const s = Math.min(
      (this.cssWidth - pad * 2) / this.imageWidth,
      (this.cssHeight - pad * 2) / this.imageHeight,
    );
    this.scale = s > 0 ? s : 1;
    this.offset = {
      x: (this.cssWidth - this.imageWidth * this.scale) / 2,
      y: (this.cssHeight - this.imageHeight * this.scale) / 2,
    };
    this.redraw();
  }

  zoomAt(factor, screenPt) {
    const before = this.toImage(screenPt);
    const next = clamp(this.scale * factor, 0.02, 120);
    if (next === this.scale) return;
    this.scale = next;
    const after = this.toScreen(before);
    this.offset.x += screenPt.x - after.x;
    this.offset.y += screenPt.y - after.y;
    this.redraw();
  }

  centerOn(imagePt, scale = null) {
    if (scale) this.scale = clamp(scale, 0.02, 120);
    this.offset = {
      x: this.cssWidth / 2 - imagePt.x * this.scale,
      y: this.cssHeight / 2 - imagePt.y * this.scale,
    };
    this.redraw();
  }

  /** Hit tolerance expressed in image pixels for the current zoom. */
  get hitTolerance() { return HIT_RADIUS_CSS / this.scale; }

  /**
   * Pan/zoom survives a re-render. The step modules rebuild their DOM after
   * every click; without this the view would snap back to "fit" each time,
   * which makes precision work impossible.
   */
  saveState() { return { scale: this.scale, offset: { ...this.offset } }; }

  restoreState(s) {
    if (!s || !Number.isFinite(s.scale)) return;
    this.scale = s.scale;
    this.offset = { ...s.offset };
    this.redraw();
  }

  // --- events --------------------------------------------------------------

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.cssWidth * dpr));
    const h = Math.max(1, Math.round(this.cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.redraw();
  }

  _down(e) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.eventPoint(e));
    if (this.pointers.size === 2) {
      this.dragId = null;
      const pts = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      return;
    }
    const screen = this.eventPoint(e);
    const img = this.toImage(screen);
    if (this.spaceDown || e.button === 1 || e.button === 2) {
      this.panning = true;
      this._panFrom = screen;
      this.canvas.parentElement && this.canvas.parentElement.classList.add('panning');
      return;
    }
    const hit = this.h.hitTest ? this.h.hitTest(img, this.hitTolerance) : null;
    if (hit) {
      this.dragId = hit;
      this.dragMoved = false;
      if (this.h.onSelect) this.h.onSelect(hit);
      this.pointer = img;
      this.redraw();
      return;
    }
    this.dragId = null;
    this.pointer = img;
    this._pendingPlace = img;
    this.redraw();
  }

  _move(e) {
    if (!this.enabled) return;
    const screen = this.eventPoint(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);

    if (this.pinch && this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (this.pinch.dist > 0) this.zoomAt(dist / this.pinch.dist, mid);
      this.offset.x += mid.x - this.pinch.mid.x;
      this.offset.y += mid.y - this.pinch.mid.y;
      this.pinch = { dist, mid };
      this.redraw();
      return;
    }

    if (this.panning) {
      this.offset.x += screen.x - this._panFrom.x;
      this.offset.y += screen.y - this._panFrom.y;
      this._panFrom = screen;
      this.redraw();
      return;
    }

    const img = this.toImage(screen);
    this.pointer = img;
    if (this.dragId) {
      this.dragMoved = true;
      this._pendingPlace = null;
      if (this.h.onMoveItem) this.h.onMoveItem(this.dragId, img);
    } else if (!this._pendingPlace) {
      const hit = this.h.hitTest ? this.h.hitTest(img, this.hitTolerance) : null;
      if (hit !== this.hoverId) this.hoverId = hit;
    }
    if (this.h.onPointer) this.h.onPointer(img);
    this.redraw();
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.panning) {
      this.panning = false;
      this.canvas.parentElement && this.canvas.parentElement.classList.remove('panning');
      this._pendingPlace = null;
      return;
    }
    if (this.dragId) {
      const id = this.dragId;
      this.dragId = null;
      if (this.h.onMoveEnd) this.h.onMoveEnd(id, this.dragMoved);
      return;
    }
    if (this._pendingPlace && this.h.onPlace) {
      const p = this.toImage(this.eventPoint(e));
      this.h.onPlace(p);
    }
    this._pendingPlace = null;
    this.redraw();
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const screen = this.eventPoint(e);
    const unit = e.deltaMode === 1 ? 16 : 1;
    const factor = Math.exp((-e.deltaY * unit) / 320);
    this.zoomAt(factor, screen);
    this.pointer = this.toImage(screen);
    if (this.h.onPointer) this.h.onPointer(this.pointer);
  }

  // --- painting ------------------------------------------------------------

  redraw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    if (!this.image) return;

    ctx.imageSmoothingEnabled = this.scale < 2.5;
    ctx.drawImage(
      this.image, 0, 0, this.imageWidth, this.imageHeight,
      this.offset.x, this.offset.y,
      this.imageWidth * this.scale, this.imageHeight * this.scale,
    );

    const view = {
      toScreen: (p) => this.toScreen(p),
      scale: this.scale,
      pointer: this.pointer,
      hoverId: this.hoverId,
      dragId: this.dragId,
      inLoupe: false,
    };
    if (this.h.drawOverlay) this.h.drawOverlay(ctx, view);
    if (this.pointer && this.h.loupe !== false) this._drawLoupe(ctx);
  }

  _drawLoupe(ctx) {
    const c = this.toScreen(this.pointer);
    if (c.x < -40 || c.y < -40 || c.x > this.cssWidth + 40 || c.y > this.cssHeight + 40) return;
    const R = LOUPE_RADIUS;
    let cx = c.x + R + 26;
    let cy = c.y - R - 26;
    if (cx + R + 6 > this.cssWidth) cx = c.x - R - 26;
    if (cy - R - 6 < 0) cy = c.y + R + 26;
    cx = clamp(cx, R + 4, this.cssWidth - R - 4);
    cy = clamp(cy, R + 4, this.cssHeight - R - 4);

    const lScale = Math.max(this.scale * LOUPE_FACTOR, LOUPE_MIN_SCALE);
    const off = { x: cx - this.pointer.x * lScale, y: cy - this.pointer.y * lScale };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.image, 0, 0, this.imageWidth, this.imageHeight,
      off.x, off.y, this.imageWidth * lScale, this.imageHeight * lScale,
    );
    if (this.h.drawOverlay) {
      this.h.drawOverlay(ctx, {
        toScreen: (p) => ({ x: p.x * lScale + off.x, y: p.y * lScale + off.y }),
        scale: lScale,
        pointer: this.pointer,
        hoverId: this.hoverId,
        dragId: this.dragId,
        inLoupe: true,
      });
    }
    // crosshair at the exact pointer position
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

// --- small shared painters ---------------------------------------------------

export function dot(ctx, p, { color = '#33628f', r = 5, selected = false, hover = false, ghost = false } = {}) {
  ctx.save();
  if (ghost) {
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = ghost ? 'rgba(255,255,255,.25)' : color;
  ctx.fill();
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeStyle = selected ? '#ffffff' : (hover ? '#ffffff' : 'rgba(255,255,255,.75)');
  ctx.stroke();
  if (selected) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function crosshair(ctx, p, color = 'rgba(255,255,255,.9)', size = 9) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y); ctx.lineTo(p.x + size, p.y);
  ctx.moveTo(p.x, p.y - size); ctx.lineTo(p.x, p.y + size);
  ctx.stroke();
  ctx.restore();
}

export function label(ctx, p, text, { color = '#33628f', dy = -14 } = {}) {
  ctx.save();
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(text).width;
  const x = p.x - w / 2;
  const y = p.y + dy;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillRect(x - 4, y - 11, w + 8, 15);
  ctx.strokeStyle = 'rgba(0,0,0,.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 11, w + 8, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A drafting-style dimension line with ticks at both ends. */
export function dimensionLine(ctx, a, b, text, color = '#33628f') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(ang + Math.PI / 2) * 7, p.y + Math.sin(ang + Math.PI / 2) * 7);
    ctx.lineTo(p.x - Math.cos(ang + Math.PI / 2) * 7, p.y - Math.sin(ang + Math.PI / 2) * 7);
    ctx.stroke();
  }
  ctx.restore();
  if (text) label(ctx, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text, { color, dy: -10 });
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function isTyping(node) {
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

/** Tiny DOM builder shared by every UI module. */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'value') node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

/** A row of view tabs (front / side / top). */
export function viewTabs(views, active, labels, onPick) {
  const bar = el('div', { class: 'viewtabs' });
  for (const id of views) {
    const b = el('button', {}, labels[id]);
    if (id === active) b.setAttribute('aria-current', 'true');
    b.onclick = () => onPick(id);
    bar.append(b);
  }
  return bar;
}
