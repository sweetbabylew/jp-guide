// reconcile.js — cross-view comparison of independently measured fields.
//
// PURE. No DOM, no Date, no random.
//
// ANNOTATOR.md: "any field with two independent sources (seat width F/T,
// spread F/T, depth S/T) compares them; disagreement beyond max(2%, 1/4 in)
// emits a conflict record {field, valueA, sourceA, valueB, sourceB} for the
// spec table. Otherwise average."

/** The absolute half of the tolerance, expressed in the project's units. */
export function absoluteFloor(units) {
  return units === 'mm' ? 6.35 : 0.25; // 1/4 in
}

/**
 * The disagreement budget for a pair of readings.
 * 2% is taken on the mean of the two readings (neither is privileged).
 */
export function threshold(a, b, units) {
  const mean = Math.abs(a + b) / 2;
  return Math.max(0.02 * mean, absoluteFloor(units));
}

/**
 * compare(a, b, units) -> { diff, threshold, agree }
 * Boundary rule: readings exactly ON the threshold AGREE; a conflict needs
 * strictly more disagreement than the budget. test.mjs pins both sides.
 */
export function compare(a, b, units) {
  const diff = Math.abs(a - b);
  const t = threshold(a, b, units);
  return { diff, threshold: t, agree: diff <= t };
}

/** Angles do not use the length tolerance; they get a flat degree budget. */
export const ANGLE_TOLERANCE_DEG = 1.0;

export function compareAngles(a, b) {
  const diff = Math.abs(a - b);
  return { diff, threshold: ANGLE_TOLERANCE_DEG, agree: diff <= ANGLE_TOLERANCE_DEG };
}

/**
 * Merge the readings for one field.
 *
 * entries: [{ value, source, seeded? }] — `source` is a short view tag
 *          ('front', 'side', 'top') used verbatim in the conflict record.
 *          `seeded` marks a reading that leans on a landmark the TEMPLATE
 *          placed rather than the user (solve.js); it rides along untouched
 *          except that it spreads — see below.
 * choice:  optional source name the user already picked for this field.
 *
 * Returns { value, source, sources, seeded, conflict|null }.
 *   source: 'measured' (one reading) | 'reconciled' (agreeing pair averaged)
 *           | 'chosen' (a conflict the user resolved)
 *           | 'conflict' (unresolved — value falls back to the first reading)
 *   seeded: true when a template position is inside the number that came out.
 *           Averaging a measured reading with a template one does not produce
 *           half a measurement, so ANY seeded input makes the result seeded;
 *           a conflict the user RESOLVED takes the flag from the reading they
 *           actually picked, because that is the only one still in the answer.
 */
export function reconcileField(field, entries, units, choice = null, kind = 'length') {
  const usable = entries.filter((e) => e && Number.isFinite(e.value));
  if (usable.length === 0) return null;
  if (usable.length === 1) {
    return {
      field,
      value: usable[0].value,
      source: 'measured',
      sources: [usable[0].source],
      seeded: Boolean(usable[0].seeded),
      conflict: null,
    };
  }
  // Only two independent views ever measure the same field in phase 2, but
  // fold left-to-right so a third source would still behave sanely.
  let acc = usable[0];
  let merged = [usable[0].source];
  for (let i = 1; i < usable.length; i += 1) {
    const b = usable[i];
    const cmp = kind === 'angle'
      ? compareAngles(acc.value, b.value)
      : compare(acc.value, b.value, units);
    if (!cmp.agree) {
      const conflict = {
        field,
        valueA: acc.value,
        sourceA: acc.source,
        valueB: b.value,
        sourceB: b.source,
        diff: cmp.diff,
        threshold: cmp.threshold,
      };
      if (choice === conflict.sourceA || choice === conflict.sourceB) {
        const picked = choice === conflict.sourceA ? acc : b;
        return {
          field,
          value: picked.value,
          source: 'chosen',
          sources: [conflict.sourceA, conflict.sourceB],
          seeded: Boolean(picked.seeded),
          chosen: choice,
          conflict,
        };
      }
      return {
        field,
        value: acc.value,
        source: 'conflict',
        sources: [conflict.sourceA, conflict.sourceB],
        seeded: Boolean(acc.seeded),
        conflict,
      };
    }
    acc = {
      value: (acc.value + b.value) / 2,
      source: `${acc.source}+${b.source}`,
      seeded: Boolean(acc.seeded || b.seeded),
    };
    merged.push(b.source);
  }
  return {
    field,
    value: acc.value,
    source: 'reconciled',
    sources: merged,
    seeded: Boolean(acc.seeded),
    conflict: null,
  };
}

/**
 * reconcile(measurements, units, choices)
 *
 * measurements: { [field]: [{ value, source }] }
 * choices:      { [field]: sourceName }  (user's pick for a conflicted field)
 *
 * -> { values: { [field]: resolved }, conflicts: [record] }
 * Field order is the insertion order of `measurements`, so the output is
 * deterministic for a deterministic input.
 */
export function reconcile(measurements, units, choices = {}, kinds = {}) {
  const values = {};
  const conflicts = [];
  for (const [field, entries] of Object.entries(measurements)) {
    const resolved = reconcileField(
      field, entries, units, choices[field] ?? null, kinds[field] || 'length',
    );
    if (!resolved) continue;
    values[field] = resolved;
    if (resolved.conflict) conflicts.push(resolved.conflict);
  }
  return { values, conflicts };
}
