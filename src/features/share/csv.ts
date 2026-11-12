import type { Analysis } from '../../analysis/types';
import { barSpeed } from '../analysis/speed';

// The lift as data (owner, 12-11: parity with WL Analysis): one row per frame of the bar path. Positions are 0..1 of
// the picture (x from the left, y from the top), speed is the bar's vertical speed in m/s (up positive) where the
// plate was measured, source says whether the plate or the hands gave the point. In the lift only, when one is marked.
export function liftCsv(analysis: Analysis): string {
  const path = analysis.reps[0]?.path ?? [];
  const fps = analysis.video.fps || 30;
  const speed = barSpeed(path, fps, analysis.lift);
  const inLift = (f: number) => !analysis.lift || (f >= analysis.lift.startFrame && f <= analysis.lift.endFrame);
  const rows = path
    .filter((p) => inLift(p.frame))
    .map((p) => {
      const v = speed?.at.get(p.frame);
      return [p.frame, (p.frame / fps).toFixed(3), p.x.toFixed(4), p.y.toFixed(4), v === undefined ? '' : v.toFixed(2), p.src ?? (analysis.traceKind === 'hip' ? 'hips' : '')].join(',');
    });
  return ['frame,time_s,x,y,bar_speed_m_s,source', ...rows].join('\n') + '\n';
}
