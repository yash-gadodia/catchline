import type { Size } from '../../analysis/geometry';
import type { Point, Rep, TracePoint } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { angleAt } from './drawGeometry';

// The frame on screen at a video time, and the time that lands inside a frame (its middle, so an exact seek cannot
// fall on the frame before).
export function frameAt(time: number, fps: number, count: number): number {
  return Math.min(Math.max(0, Math.floor(time * fps + 1e-6)), Math.max(0, count - 1));
}

export function timeOf(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

// The frames a screen keeps to: the lift itself where tracking marked one that fits the clip, else (or when the
// lifter asks for the whole clip) every frame.
export type FrameRange = { cropped: boolean; first: number; last: number };
export function liftRange(lift: { startFrame: number; endFrame: number } | undefined, count: number, whole: boolean): FrameRange {
  const end = Math.max(0, count - 1);
  const ok = lift !== undefined && lift.startFrame >= 0 && lift.startFrame < lift.endFrame && lift.endFrame < count;
  return ok && !whole ? { cropped: true, first: lift.startFrame, last: lift.endFrame } : { cropped: false, first: 0, last: end };
}

// Body.frames order (tracking.ts BODY_JOINTS): shoulder, elbow, wrist, hip, knee, ankle, heel, toe, each left then right.
const SHO = 0, ELB = 2, WRI = 4, HIP = 6, KNEE = 8, ANK = 10, HEEL = 12, TOE = 14;
const SIDE_BONES: [number, number][] = [[SHO, ELB], [ELB, WRI], [SHO, HIP], [HIP, KNEE], [KNEE, ANK], [ANK, HEEL], [HEEL, TOE]];

export function joints(body: Body | null, frame: number): (Point | null)[] {
  const row = body?.frames[frame];
  if (!row) return [];
  const out: (Point | null)[] = [];
  for (let i = 0; i < row.length; i += 2) {
    const x = row[i];
    const y = row[i + 1];
    out.push(x == null || y == null ? null : { x, y });
  }
  return out;
}

export type Side = 0 | 1 | 'both';

// Filmed from the side the two halves of the body lie on top of each other and read as a tangle, so one is drawn:
// the half the pose saw more of over the clip. Off side-on, or with no angle known, both are.
export function drawnSide(body: Body | null, offSideDeg: number | undefined): Side {
  if (!body || offSideDeg == null || offSideDeg > ANGLE_MAX_OFF_SIDE_DEG) return 'both';
  const seen = [0, 0];
  for (const row of body.frames) for (let i = 0; i < row.length; i += 2) if (row[i] != null) seen[(i / 2) % 2] += 1;
  return seen[1] > seen[0] ? 1 : 0;
}

// The skeleton's lines on one frame: the limbs of the side drawn, and for both sides the shoulders and hips joined
// across. A bone with either end unseen is left out.
export function bones(j: (Point | null)[], side: Side = 'both'): [Point, Point][] {
  const out: [Point, Point][] = [];
  const add = (a: number, b: number) => {
    const p = j[a];
    const q = j[b];
    if (p && q) out.push([p, q]);
  };
  for (const sd of side === 'both' ? [0, 1] : [side]) for (const [a, b] of SIDE_BONES) add(a + sd, b + sd);
  if (side === 'both') {
    add(SHO, SHO + 1);
    add(HIP, HIP + 1);
  }
  return out;
}

export type JointAngle = { name: 'knee' | 'hip' | 'elbow'; deg: number; at: Point };

const ANGLES: [JointAngle['name'], number, number, number][] = [
  ['elbow', SHO, ELB, WRI],
  ['hip', SHO, HIP, KNEE],
  ['knee', HIP, KNEE, ANK],
];

// The knee, hip and elbow angles on one frame, in video pixels: the mean of the two sides where both are seen, else
// the side that is (or the one side drawn); labelled at that joint.
export function jointAngles(j: (Point | null)[], video: Size, side: Side = 'both'): JointAngle[] {
  const out: JointAngle[] = [];
  for (const [name, a, v, c] of ANGLES) {
    const sides = (side === 'both' ? [0, 1] : [side]).flatMap((s) => {
      const [p, q, r] = [j[a + s], j[v + s], j[c + s]];
      return p && q && r ? [{ deg: angleAt(p, q, r, video), at: q }] : [];
    });
    if (!sides.length) continue;
    const deg = sides.reduce((sum, s) => sum + s.deg, 0) / sides.length;
    const at = { x: sides.reduce((sum, s) => sum + s.at.x, 0) / sides.length, y: sides.reduce((sum, s) => sum + s.at.y, 0) / sides.length };
    out.push({ name, deg, at });
  }
  return out;
}

// The start line: where the bar began (the rep's guide, else the first traced point).
export function startLineX(rep: Rep | undefined): number | null {
  if (!rep) return null;
  return rep.guides && Number.isFinite(rep.guides.startX) ? rep.guides.startX : (rep.path[0]?.x ?? null);
}

// Where the feet stood on the first frame that shows them: the floor line.
export function floorY(body: Body | null): number | null {
  if (!body) return null;
  for (let f = 0; f < body.frames.length; f++) {
    const j = joints(body, f);
    const ys = [HEEL, HEEL + 1, TOE, TOE + 1].flatMap((i) => {
      const p = j[i];
      return p ? [p.y] : [];
    });
    if (ys.length >= 2) return Math.max(...ys);
  }
  return null;
}

// Whether most of the path was read off the plate (else the hands stand in for the bar).
export function mostlyPlate(path: TracePoint[]): boolean {
  if (!path.length) return false;
  return path.filter((p) => p.src === 'plate').length >= path.length / 2;
}

// Angles are read in the image plane, so they are only shown when the camera is near side-on.
export const ANGLE_MAX_OFF_SIDE_DEG = 30;

// Labels that would sit on top of each other are moved apart down the screen (a knee and an elbow meet in a squat).
export function spread<T extends { x: number; y: number }>(labels: T[], w: number, h: number): T[] {
  const out: T[] = [];
  for (const l of [...labels].sort((a, b) => a.y - b.y)) {
    let y = l.y;
    for (const o of out) if (Math.abs(o.x - l.x) < w && Math.abs(o.y - y) < h) y = o.y + h;
    out.push({ ...l, y });
  }
  return out;
}
