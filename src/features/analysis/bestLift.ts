import type { Analysis, Point } from '../../analysis/types';
import { useLibrary } from '../library/repository';
import { useMadeLog } from '../library/madeLog';
import type { Lift } from '../library/types';

// The lifter's best other lift of this movement: made (their own call first), heaviest, then newest.
export function bestLiftFor(a: Analysis, lifts: Lift[], own: Record<string, boolean>): Lift | undefined {
  const made = (l: Lift) => (l.analysisId ? own[l.analysisId] : undefined) ?? l.made;
  return lifts
    .filter((l) => l.movement === a.movement && l.status === 'done' && l.analysisId && l.analysisId !== a.id && made(l) === true)
    .reduce<Lift | undefined>((best, l) => {
      if (!best) return l;
      const [bl, ll] = [best.loadKg ?? -1, l.loadKg ?? -1];
      return ll > bl || (ll === bl && l.date > best.date) ? l : best;
    }, undefined);
}

export function useBestLift(a: Analysis | null): Lift | undefined {
  const { lifts } = useLibrary();
  const own = useMadeLog((s) => s.made);
  return a ? bestLiftFor(a, lifts, own) : undefined;
}

// Maps another lift's path into this lift's frame: its start on this start, sized by the two clips' scales.
export function aligner(other: Analysis, today: Analysis, otherStart: Point, todayStart: Point): (p: Point) => Point {
  const k = today.pxPerCm && other.pxPerCm ? today.pxPerCm / other.pxPerCm : 1;
  const sx = (other.video.width * k) / today.video.width;
  const sy = (other.video.height * k) / today.video.height;
  return (p) => ({ x: todayStart.x + (p.x - otherStart.x) * sx, y: todayStart.y + (p.y - otherStart.y) * sy });
}
