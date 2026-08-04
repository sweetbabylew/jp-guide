// spectable.js — step 4. The editable parts table: solved value, source badge,
// pinned edits, and inline conflict choosers.
//
// UI module. Every number it shows comes from solve.js; every edit it makes
// goes into project.pins, which assembleSpec applies last — the tape wins.

import { el } from './viewport.js';
import {
  FIELDS, GROUP_ORDER, GROUP_LABEL, sourceOf, templateFacts, curveFacts,
} from './solve.js';

const SOURCE_TEXT = {
  measured: 'measured',
  reconciled: 'reconciled',
  chosen: 'you chose',
  conflict: 'conflict',
  template: 'template',
  // Solved, but out of a landmark still sitting where the template put it.
  // Same family as 'template' — the two words say which door it came in by.
  seeded: 'template position',
  edited: 'edited',
  answered: 'you answered',
};

const SOURCE_HELP = {
  measured: 'Solved from one view’s clicks.',
  reconciled: 'Two views agreed; this is their average.',
  chosen: 'Two views disagreed and you picked one.',
  conflict: 'Two views disagree by more than the tolerance — pick one below.',
  template: 'Not visible in the photos you gave; carried over from the template.',
  seeded: 'Solved from a landmark still sitting where the template put it — so this is the template’s number, not a measurement. Drag or nudge that point onto your chair on the Landmarks step and it becomes yours.',
  edited: 'You typed this. It survives every re-solve until you clear it.',
  answered: 'You answered this about your chair on the Photos step.',
};

/**
 * The badge's CSS class. A template position wears the template's colours on
 * purpose: it belongs to the same "not your chair" family, and inventing a
 * third colour for it would suggest a third kind of trust.
 */
const SOURCE_CLASS = { seeded: 'template' };

// ---------------------------------------------------------------------------
// The trust surface (ANNOTATOR.md phase 3b)
// ---------------------------------------------------------------------------
//
// Field-test finding: the Drawing step rendered a pure template with a straight
// face. These two are the fix, and they are deliberately loud — red at zero,
// amber while any number is still the template's, and gone only when every one
// of them came from the chair.

const BANNER_STYLE = {
  none: 'border:1px solid var(--bad);border-left-width:5px;background:var(--bad-soft);'
    + 'color:#6d2320;border-radius:3px;padding:10px 12px;margin-bottom:12px',
  partial: 'border:1px solid var(--warn);border-left-width:5px;background:var(--warn-soft);'
    + 'color:#6a3d12;border-radius:3px;padding:10px 12px;margin-bottom:12px',
};

/**
 * trustBanner(trust) -> node | null
 * null when everything is measured or pinned: at that point there is nothing to
 * warn about, and a banner that never goes away stops being read.
 *
 * A count alone cannot say "the arm bow is invented", so any curve still
 * carrying a template or stock shape is NAMED, in a line of its own, with the
 * step that can fix it. That is the difference between a drawing the user can
 * trust and one they only think they can.
 */
export function trustBanner(trust) {
  if (!trust || trust.state === 'complete') return null;
  const box = el('div', { role: 'status', style: BANNER_STYLE[trust.state] });
  box.append(el('div', { style: 'font-weight:700;letter-spacing:.2px' }, trust.headline));
  box.append(el('div', { style: 'font-size:13px;margin-top:4px' }, trust.state === 'none'
    ? `Nothing in these drawings has been measured from your photos yet. Every number below is the ${trust.templateName} template’s — calibrate a view and place some landmarks, or type the numbers you have on the Spec step.`
    : `${trust.total - trust.measured} of them ${trust.total - trust.measured === 1 ? 'is' : 'are'} still the ${trust.templateName} template’s. They are marked “template” on the Spec step; measure or type over the ones that matter for your chair.`));
  for (const line of trust.curveAdvice || []) {
    box.append(el('div', { style: 'font-size:13px;margin-top:5px;font-weight:600' }, `· ${line}`));
  }
  return box;
}

/** The same count, small enough to ride on the Spec tab. */
export function trustChip(trust) {
  if (!trust || trust.state === 'complete') return null;
  const bad = trust.state === 'none';
  return el('span', {
    class: 'mono',
    title: trust.headline,
    style: 'font-size:10.5px;padding:1px 5px;border-radius:2px;'
      + (bad
        ? 'background:var(--bad-soft);color:var(--bad);'
        : 'background:var(--warn-soft);color:var(--warn);'),
  }, `${trust.measured}/${trust.total} yours`);
}

export function renderSpec(app, root) {
  root.textContent = '';
  root.append(el('h2', {}, 'Spec'));
  root.append(el('p', { class: 'lede' },
    'Every number the drawing will use. Photo-derived values are drafts — type over any of them and your value is pinned for good.'));

  const solved = app.solved;
  if (!solved) {
    root.append(el('div', { class: 'note warn' }, 'Nothing solved yet — calibrate a view and place some landmarks.'));
    return;
  }
  const {
    spec, values, conflicts, checks, notes, repairs, curves, trust,
  } = solved;
  const units = app.project.units;

  const banner = trustBanner(trust);
  if (banner) root.append(banner);

  const head = el('div', { class: 'panel' });
  head.append(el('h3', {}, 'Coverage'));
  head.append(el('p', { class: 'hint strong' },
    `${solved.coverage.solved} of ${solved.coverage.solvable} measurable fields solved from your photos. `
    + `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}, `
    + `${Object.keys(app.project.pins).length} pinned by hand.`));
  const clearAll = el('button', { class: 'tiny' }, 'Clear all pinned edits');
  clearAll.disabled = Object.keys(app.project.pins).length === 0;
  clearAll.onclick = () => { app.project.pins = {}; app.commit(); app.rerenderStep(); };
  head.append(el('div', { class: 'row' }, clearAll));
  root.append(head);

  for (const note of repairs) {
    root.append(el('div', { class: 'note warn' }, `Auto-repaired so the drawing could render — ${note}`));
  }
  for (const note of notes) root.append(el('div', { class: 'note' }, note));

  const panel = el('div', { class: 'panel' });
  const table = el('table', { class: 'spec' });
  const thead = el('thead', {}, el('tr', {},
    el('th', {}, 'Dimension'),
    el('th', { style: 'text-align:right' }, 'Value'),
    el('th', {}, ''),
    el('th', {}, 'Source'),
    el('th', {}, '')));
  table.append(thead);
  const tbody = el('tbody');
  table.append(tbody);

  for (const group of GROUP_ORDER) {
    const fields = FIELDS.filter((f) => f.group === group && (!f.applies || f.applies(spec)));
    if (!fields.length) continue;
    tbody.append(el('tr', { class: 'grp' }, el('td', { colspan: '5' }, GROUP_LABEL[group])));
    for (const field of fields) {
      const source = sourceOf(field.key, values, app.project.pins, app.project);
      const current = field.read(spec);
      const resolved = values[field.key];
      // Read the chooser off the RESOLVED value, not off the badge: a field can
      // be badged "template position" (its landmarks are the template's) and
      // still have two views disagreeing under it, and the user still needs the
      // two buttons that settle it.
      const isConflict = source !== 'edited' && Boolean(resolved) && resolved.source === 'conflict';
      const tr = el('tr', { class: `${isConflict ? 'conflict ' : ''}${source === 'edited' ? 'pinned' : ''}` });

      const nameCell = el('td', { class: 'name' }, field.label);
      if (field.solvedIn) {
        nameCell.append(el('div', { class: 'hint' }, `from the ${field.solvedIn} view${field.solvedIn.includes('+') ? 's' : ''}`));
      }
      tr.append(nameCell);

      // Most rows are a number. A boolean row is the same row with the same
      // pin behind it — pins are numbers, so it stores 1 / 0 — because a joint
      // that changes the drawing belongs in the table with the dimensions.
      const setPin = (v) => {
        app.project.pins[field.key] = v;
        app.commit();
        app.rerenderStep();
      };
      let valCell;
      if (field.kind === 'boolean') {
        const sel = el('select', { style: 'width:100%' });
        for (const [v, txt] of [
          ['1', field.trueLabel || 'yes'],
          ['0', field.falseLabel || 'no'],
        ]) {
          const o = el('option', { value: v }, txt);
          if (String(current ? 1 : 0) === v) o.selected = true;
          sel.append(o);
        }
        sel.onchange = () => setPin(Number(sel.value));
        valCell = el('td', { class: 'val', style: 'width:190px' }, sel);
      } else {
        const input = el('input', {
          type: 'number',
          step: field.kind === 'angle' ? '0.1' : (units === 'mm' ? '1' : '0.0625'),
          value: fmtNumber(current, field.kind),
        });
        input.onchange = () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) { app.rerenderStep(); return; }
          setPin(v);
        };
        valCell = el('td', { class: 'val' }, input);
        if (units === 'in' && field.kind === 'length') {
          valCell.append(el('div', { class: 'hint mono', style: 'text-align:right' }, asFraction(current)));
        }
      }
      tr.append(valCell);
      tr.append(el('td', { class: 'unit' }, field.kind === 'angle' ? '°'
        : (field.kind === 'count' || field.kind === 'boolean' ? '' : units)));

      const badge = el('span', {
        class: `badge ${SOURCE_CLASS[source] || source}`,
        title: SOURCE_HELP[source],
      }, SOURCE_TEXT[source]);
      const srcCell = el('td', { class: 'src' }, badge);
      if (resolved && resolved.sources && resolved.sources.length > 1 && !isConflict) {
        srcCell.append(el('div', { class: 'hint' }, resolved.sources.join(' + ')));
      }
      tr.append(srcCell);

      const act = el('td', { class: 'act' });
      if (source === 'edited') {
        const undo = el('button', { class: 'ghost tiny', title: 'Clear this edit and go back to the solved value' }, '×');
        undo.onclick = () => {
          delete app.project.pins[field.key];
          app.commit();
          app.rerenderStep();
        };
        act.append(undo);
      }
      tr.append(act);
      tbody.append(tr);

      if (isConflict) {
        const c = resolved.conflict;
        const row = el('tr', { class: 'conflict' });
        const cell = el('td', { colspan: '5' });
        const box = el('div', { class: 'conflict-choice' });
        box.append(el('span', {},
          `The ${c.sourceA} and ${c.sourceB} views disagree by ${fmtNumber(c.diff, 'length')} ${units} `
          + `(tolerance ${fmtNumber(c.threshold, 'length')}). Which do you trust?`));
        for (const which of ['A', 'B']) {
          const src = which === 'A' ? c.sourceA : c.sourceB;
          const val = which === 'A' ? c.valueA : c.valueB;
          const b = el('button', {}, `${src}: ${fmtNumber(val, field.kind)}`);
          b.onclick = () => {
            app.project.choices[field.key] = src;
            app.commit();
            app.rerenderStep();
          };
          box.append(b);
        }
        cell.append(box);
        row.append(cell);
        tbody.append(row);
      } else if (resolved && resolved.conflict && resolved.source === 'chosen') {
        const c = resolved.conflict;
        const other = resolved.chosen === c.sourceA ? c.sourceB : c.sourceA;
        const otherVal = resolved.chosen === c.sourceA ? c.valueB : c.valueA;
        const row = el('tr');
        row.append(el('td', { colspan: '5' }, el('div', { class: 'hint', style: 'padding-left:8px' },
          `You picked the ${resolved.chosen} view over the ${other} view, which read ${fmtNumber(otherVal, field.kind)}. `,
          reopen(app, field.key))));
        tbody.append(row);
      } else if (resolved && resolved.conflict && source === 'edited') {
        const c = resolved.conflict;
        const row = el('tr');
        row.append(el('td', { colspan: '5' }, el('div', { class: 'hint', style: 'padding-left:8px' },
          `Your typed value overrides a disagreement: ${c.sourceA} read ${fmtNumber(c.valueA, field.kind)}, `
          + `${c.sourceB} read ${fmtNumber(c.valueB, field.kind)}.`)));
        tbody.append(row);
      }
    }
  }
  panel.append(table);
  root.append(panel);

  if (checks.length) {
    const cp = el('div', { class: 'panel' });
    cp.append(el('h3', {}, 'Cross-checks — measured, but not fed into the drawing'));
    const t = el('table', { class: 'spec' });
    const tb = el('tbody');
    for (const c of checks) {
      tb.append(el('tr', {},
        el('td', {}, c.label),
        el('td', { class: 'val mono', style: 'text-align:right' }, fmtNumber(c.value, c.kind)),
        el('td', { class: 'unit' }, c.kind === 'angle' ? '°' : units),
        el('td', { class: 'src' }, el('span', { class: 'badge measured' }, c.source)),
        el('td', { class: 'act' })));
    }
    t.append(tb);
    cp.append(t);
    root.append(cp);
  }

  // --- curves ---------------------------------------------------------------
  // A curve is not a number, so it cannot be typed over; what it CAN do is show
  // its derived numbers and say honestly where its points came from. A traced
  // curve is a measurement — the badge says measured, and it means it.
  const curveRows = curveFacts(spec, curves || {}, app.template);
  if (curveRows.length) {
    const cp = el('div', { class: 'panel' });
    cp.append(el('h3', {}, 'Curves — traced on the top view, drawn as traced'));
    const t = el('table', { class: 'spec' });
    const tb = el('tbody');
    for (const row of curveRows) {
      const traced = row.source === 'measured';
      tb.append(el('tr', {},
        el('td', { class: 'name' }, row.label,
          el('div', { class: 'hint' }, traced
            ? `traced (${row.count} points)`
            : `${row.count} points ${row.origin === 'default' ? 'of stock shape this app invented' : 'from the template'} — not your chair’s shape`)),
        el('td', { class: 'mono', colspan: '2' },
          ...row.facts.map(([k, v]) => el('div', {},
            `${k}: ${typeof v === 'number' ? `${fmtNumber(v)} ${units}` : v}`))),
        el('td', { class: 'src' }, el('span', {
          class: `badge ${traced ? 'measured' : 'template'}`,
          title: traced
            ? 'Traced on the rectified top view and stored exactly as clicked.'
            : 'No trace for this curve — its shape is not your chair’s. Trace it on the Landmarks step, top view.',
        }, traced ? 'measured' : 'template')),
        el('td', { class: 'act' })));
    }
    t.append(tb);
    cp.append(t);
    cp.append(el('p', { class: 'hint' },
      'A radius is printed only when one arc genuinely fits the trace within 1/16 in. A trace that never leaves its own chord reads “straight”; anything else reads “varies”, which is the honest answer for a curve shaped by eye.'));
    cp.append(el('p', { class: 'hint' },
      'Every curve here counts in the measured/template count above — a shape nobody traced is the template’s, however many numbers around it are yours.'));
    root.append(cp);
  }

  const facts = el('div', { class: 'panel' });
  facts.append(el('h3', {}, 'From the template — not measurable from photos'));
  const ft = el('table', { class: 'spec' });
  const ftb = el('tbody');
  for (const [k, v] of templateFacts(spec)) {
    ftb.append(el('tr', {}, el('td', {}, k), el('td', { colspan: '4', class: 'mono' }, String(v))));
  }
  ft.append(ftb);
  facts.append(ft);
  root.append(facts);

  const go = el('div', { class: 'row', style: 'margin-top:14px' });
  const next = el('button', { class: 'primary' }, 'See the drawing →');
  next.onclick = () => app.goto('drawing');
  go.append(next);
  root.append(go);
}

function reopen(app, key) {
  const b = el('button', { class: 'ghost tiny' }, 'change');
  b.onclick = () => { delete app.project.choices[key]; app.commit(); app.rerenderStep(); };
  return b;
}

export function fmtNumber(v, kind = 'length') {
  if (!Number.isFinite(v)) return '';
  if (kind === 'count') return String(Math.round(v));
  const rounded = Math.round(v * 1000) / 1000;
  return String(rounded);
}

/** Nearest 1/16, reduced — the way a chairmaker reads a rule. */
export function asFraction(v) {
  if (!Number.isFinite(v)) return '';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const whole = Math.floor(a);
  let num = Math.round((a - whole) * 16);
  let carry = 0;
  if (num === 16) { carry = 1; num = 0; }
  const w = whole + carry;
  if (num === 0) return `${sign}${w}`;
  let den = 16;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return w === 0 ? `${sign}${num}/${den}` : `${sign}${w} ${num}/${den}`;
}
