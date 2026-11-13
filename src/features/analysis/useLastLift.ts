import { useEffect, useState } from 'react';
import type { Analysis, Point } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { readLocalAnalysis, readLocalBody } from '../../data/localLifts';
import { liftTitle } from '../library/derive';
import { useLibrary } from '../library/repository';
import { ghostPath, liftShape, liftsBefore } from './compare';

// how many earlier lifts are read looking for one of the same kind
const LOOK_BACK = 10;

export type LastLift = { title: string; points: Point[] };

// The lifter's last lift of the same kind before this one, its bar path already laid on this lift's video. Null until read, and when
// there is no earlier lift with a path. `devId` names the earlier lift outright (a dev link, for simulator checks).
export function useLastLift(analysis: Analysis | null, body: Body | null, devId?: string): LastLift | null {
  const { lifts } = useLibrary();
  const candidates = devId ? [] : analysis ? liftsBefore(lifts, analysis.id).slice(0, LOOK_BACK) : [];
  const ids = devId ? [devId] : candidates.flatMap((l) => (l.analysisId ? [l.analysisId] : []));
  const [state, setState] = useState<{ key: string; last: LastLift | null } | null>(null);
  const key = analysis && ids.length ? `${analysis.id}:${ids.join(',')}` : '';
  useEffect(() => {
    if (!analysis || !ids.length) return;
    let live = true;
    const today = { analysis, body };
    const shape = liftShape(today);
    (async () => {
      for (let i = 0; i < ids.length; i++) {
        const [a, b] = await Promise.all([readLocalAnalysis(ids[i]), readLocalBody(ids[i])]);
        if (!live) return;
        if (!a) continue;
        const earlier = { analysis: a, body: b };
        // a dev link names the lift outright; otherwise only the same kind of lift is laid over this one
        if (!devId && (shape === null || liftShape(earlier) !== shape)) continue;
        const points = ghostPath(earlier, today);
        if (!points) continue;
        const lift = candidates[i];
        setState({ key, last: { title: lift ? liftTitle(lift) : ids[i], points } });
        return;
      }
      setState({ key, last: null });
    })().catch(() => live && setState({ key, last: null }));
    return () => {
      live = false;
    };
  }, [key]);
  return state && state.key === key ? state.last : null;
}
