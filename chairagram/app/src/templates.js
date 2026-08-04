// templates.js — the seed specs the annotator deforms.
//
// The two Jimmy Possum templates are NOT copied here: they are fetched from
// specs/ at runtime so there is exactly one copy of the golden geometry in the
// repo. The blank comb-back is a generic stick chair defined inline.
//
// Only `loadTemplateSpec` touches the network (a same-origin fetch of a static
// JSON file); everything else in this module is pure data.

export const TEMPLATE_META = [
  {
    id: 'jp-armchair',
    label: 'Jimmy Possum armchair',
    blurb: 'Comb-back armchair, full arms, four legs through the seat and the arm.',
    defaultSticks: 6,
  },
  {
    id: 'jp-bench',
    label: 'Jimmy Possum bench',
    blurb: 'Low-back bench, end boards, live-edge comb, sticks stubbed into the crest.',
    defaultSticks: 16,
  },
  {
    id: 'blank-combback',
    label: 'Blank comb-back',
    blurb: 'A plain stick chair with no arms — start here if neither template is close.',
    defaultSticks: 8,
  },
];

const SPEC_URLS = {
  'jp-armchair': '../../specs/jp-armchair.json',
  'jp-bench': '../../specs/jp-bench.json',
};

/** A generic comb-back: rectangular seat, four raked legs, no arms. */
export const BLANK_COMBBACK = {
  meta: {
    specVersion: '0.1',
    name: 'Comb-back chair',
    units: 'in',
    family: 'stick-chair',
    notes: 'Blank comb-back template — every number is a starting guess to be measured over.',
  },
  seat: {
    width: 20,
    depth: 16,
    thickness: 1.75,
    heightFront: 17.5,
    heightBack: 16.5,
    plan: { type: 'rect' },
  },
  legs: [
    { id: 'front-left', mortise: { x: -8.5, z: 2 }, rake: -10, splay: 0, section: 1.5, sectionFoot: 1.3, throughSeat: true, throughArm: false, wedged: true },
    { id: 'front-right', mortise: { x: 8.5, z: 2 }, rake: -10, splay: 0, section: 1.5, sectionFoot: 1.3, throughSeat: true, throughArm: false, wedged: true },
    { id: 'back-left', mortise: { x: -8.5, z: 12 }, rake: 18, splay: 0, section: 1.5, sectionFoot: 1.3, throughSeat: true, throughArm: false, wedged: true },
    { id: 'back-right', mortise: { x: 8.5, z: 12 }, rake: 18, splay: 0, section: 1.5, sectionFoot: 1.3, throughSeat: true, throughArm: false, wedged: true },
  ],
  sticks: {
    count: 8,
    diameter: 0.625,
    flatsPlanedFront: false,
    rowZ: 14,
    spread: 14,
    lean: 15,
    throughCrest: true,
  },
  crest: {
    length: 18,
    height: 3,
    thickness: 1,
    bottomAboveSeat: 21,
    tiltRef: 'seat',
    liveEdge: false,
  },
  arms: null,
};

const cache = new Map();

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Pre-seed the cache — used by node tests, which read specs/ from disk. */
export function primeTemplate(id, spec) {
  cache.set(id, clone(spec));
}

/** loadTemplateSpec(id) -> Promise<spec>. Cached; the blank one is synchronous. */
export async function loadTemplateSpec(id) {
  if (cache.has(id)) return clone(cache.get(id));
  if (id === 'blank-combback') {
    cache.set(id, clone(BLANK_COMBBACK));
    return clone(BLANK_COMBBACK);
  }
  const rel = SPEC_URLS[id];
  if (!rel) throw new Error(`Unknown template "${id}".`);
  const url = new URL(rel, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load the ${id} template (${res.status}). Serve the app from the chairagram/ folder so ../specs is reachable.`);
  }
  const spec = await res.json();
  cache.set(id, clone(spec));
  return clone(spec);
}

/** The template converted to the project's units (angles are unitless). */
export function templateInUnits(spec, units) {
  const out = clone(spec);
  if (out.meta.units === units) { out.meta.units = units; return out; }
  const k = units === 'mm' ? 25.4 : 1 / 25.4;
  const scale = (o, keys) => keys.forEach((key) => {
    if (Number.isFinite(o[key])) o[key] *= k;
  });
  scale(out.seat, ['width', 'depth', 'thickness', 'heightFront', 'heightBack']);
  if (Number.isFinite(out.seat.plan.backWidth)) out.seat.plan.backWidth *= k;
  if (Number.isFinite(out.seat.plan.backRadius)) out.seat.plan.backRadius *= k;
  out.legs.forEach((l) => {
    l.mortise.x *= k;
    l.mortise.z *= k;
    scale(l, ['section', 'sectionFoot', 'postDiameter']);
  });
  scale(out.sticks, ['diameter', 'rowZ', 'spread']);
  scale(out.crest, ['length', 'height', 'thickness', 'bottomAboveSeat']);
  if (out.arms) scale(out.arms, ['aboveSeat', 'boardWidth', 'thickness', 'length']);
  // v0.2 curves are coordinates like any other — they convert with everything
  // else. None of the three templates carries one today; the day one does, a
  // millimetre project would otherwise draw an inch-sized comb.
  const scaleCurve = (curve) => {
    if (curve && Array.isArray(curve.points)) {
      curve.points = curve.points.map(([x, z]) => [x * k, z * k]);
    }
  };
  if (out.seat.plan.type === 'outline') scaleCurve(out.seat.plan);
  scaleCurve(out.crest.planCurve);
  if (out.arms && out.arms.bow) {
    scale(out.arms.bow, ['section']);
    scaleCurve(out.arms.bow.planCurve);
    if (out.arms.bow.spindles) scale(out.arms.bow.spindles, ['diameter']);
  }
  out.meta.units = units;
  return out;
}
