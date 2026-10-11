import type { Analysis } from '../../analysis/types';
import { COMPARE_TARGETS, snatchMock } from '../../analysis/fixtures';
import { keyFrameForPhase, repByIndex } from '../../analysis/timeline';
import type { Stuck } from './model';

export function stuckBetween(
  before: Analysis,
  after: Analysis,
  metricId: string,
  labels: { before: string; after: string; weeks: number }
): Stuck | null {
  const a = before.measurements.find((m) => m.id === metricId);
  const b = after.measurements.find((m) => m.id === metricId);
  if (!a || !b) return null;
  const frame = (x: Analysis) => keyFrameForPhase(repByIndex(x, x.bestRepIndex), 'transition')?.image;
  return {
    label: a.label.toLowerCase().replace(' at hip', ''),
    unit: a.unit,
    before: { dateLabel: labels.before, value: a.value, image: frame(before) },
    after: { dateLabel: labels.after, value: b.value, image: frame(after) },
    weeks: labels.weeks,
  };
}

// SIM: until Memory tracks cue history, the "It stuck" card pairs today's
// mock with the best-lift compare target (6 cm, then 2 cm).
export const STUCK_FIXTURE: Stuck = stuckBetween(snatchMock, COMPARE_TARGETS.best.analysis, 'bar_drift_hip', {
  before: '30 sep',
  after: 'today',
  weeks: 3,
})!;
