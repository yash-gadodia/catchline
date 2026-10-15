type Pt = { x: number; y: number };
type Size = { width: number; height: number };

// processing-backdrop.png, measured from its pixels: the near plate's centre.
export const PROCESSING_ART = { width: 1179, height: 2556, plate: { x: 315, y: 1227 } } as const;

export const BAR_PHASES = ['first_pull', 'second_pull', 'turnover', 'catch'] as const;

// A snatch bar trajectory in art pixels from the plate centre, one cubic per phase
// [c1, c2, end]: near-vertical, back toward the hips, a small loop at the turnover,
// settling overhead.
const SEGMENTS: [Pt, Pt, Pt][] = [
  [{ x: 0, y: -50 }, { x: 10, y: -100 }, { x: 14, y: -150 }],
  [{ x: 18, y: -200 }, { x: 28, y: -250 }, { x: 24, y: -300 }],
  [{ x: 20, y: -400 }, { x: -24, y: -530 }, { x: -6, y: -640 }],
  [{ x: 12, y: -730 }, { x: 100, y: -650 }, { x: 22, y: -570 }],
];

// Where an art pixel lands when the image is drawn resizeMode="cover" into box.
export function coverPoint(p: Pt, art: Size, box: Size): Pt {
  const s = Math.max(box.width / art.width, box.height / art.height);
  return { x: (box.width - art.width * s) / 2 + p.x * s, y: (box.height - art.height * s) / 2 + p.y * s };
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

function cubicLength(p0: Pt, c1: Pt, c2: Pt, p1: Pt): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 32; i++) {
    const p = cubic(p0, c1, c2, p1, i / 32);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

const r = (n: number) => Math.round(n * 100) / 100;

// The decorative bar path for the processing silhouette at a rendered size: it starts
// on the plate, `ends` are the four phase points and `reach` the drawn length at each.
export function processingBarPath(box: Size) {
  const art = { width: PROCESSING_ART.width, height: PROCESSING_ART.height };
  const plate = PROCESSING_ART.plate;
  const at = (p: Pt) => coverPoint({ x: plate.x + p.x, y: plate.y + p.y }, art, box);
  const start = at({ x: 0, y: 0 });
  let d = `M${r(start.x)} ${r(start.y)}`;
  let from = start;
  let total = 0;
  const ends: Pt[] = [];
  const reach: number[] = [];
  for (const [c1, c2, end] of SEGMENTS) {
    const [a, b, e] = [at(c1), at(c2), at(end)];
    d += ` C${r(a.x)} ${r(a.y)} ${r(b.x)} ${r(b.y)} ${r(e.x)} ${r(e.y)}`;
    total += cubicLength(from, a, b, e);
    ends.push(e);
    reach.push(total);
    from = e;
  }
  return { start, d, ends, reach, total };
}

// Step n of the processing list draws the path up to phase n (the last phase from then on).
export function phaseForStep(step: number): number {
  return Math.max(0, Math.min(step, BAR_PHASES.length - 1));
}
