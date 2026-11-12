import { useEffect, useState } from 'react';
import type { Analysis, Point } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { readLocalAnalysis, readLocalBody } from '../../data/localLifts';
import { liftTitle } from '../library/derive';
import { useLibrary } from '../library/repository';
import { ghostPath, lastLiftBefore } from './compare';

export type LastLift = { title: string; points: Point[] };

// The lifter's last lift before this one, its bar path already laid on this lift's video. Null until read, and when
// there is no earlier lift with a path. `devId` names the earlier lift outright (a dev link, for simulator checks).
export function useLastLift(analysis: Analysis | null, body: Body | null, devId?: string): LastLift | null {
  const { lifts } = useLibrary();
  const earlier = analysis ? lastLiftBefore(lifts, analysis.id) : null;
  const earlierId = devId ?? earlier?.analysisId;
  const [state, setState] = useState<{ key: string; last: LastLift | null } | null>(null);
  const key = analysis && earlierId ? `${analysis.id}:${earlierId}` : '';
  useEffect(() => {
    if (!analysis || !earlierId) return;
    let live = true;
    Promise.all([readLocalAnalysis(earlierId), readLocalBody(earlierId)]).then(
      ([a, b]) => {
        if (!live) return;
        const points = a ? ghostPath({ analysis: a, body: b }, { analysis, body }) : null;
        setState({ key, last: points ? { title: earlier ? liftTitle(earlier) : earlierId, points } : null });
      },
      () => live && setState({ key, last: null }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return state && state.key === key ? state.last : null;
}
