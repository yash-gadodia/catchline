import type { Analysis } from '../../analysis/types';
import { bestOf, metricText, seriesFor, shortDate } from '../library/derive';
import { METRICS, PRIMARY_METRIC } from '../library/metrics';
import type { Lift, Session } from '../library/types';
import { t } from '../../i18n';

// One sentence that quotes the lifter's own numbers back against their own
// baseline: "6 cm today. Your best is 2 cm (18 Sep) and your last five average 7.6 cm."
export function baselineSentence(analysis: Analysis, lifts: Lift[], sessions: Session[]): string | null {
  const metricId = PRIMARY_METRIC[analysis.movement];
  const today = analysis.measurements.find((m) => m.id === metricId && m.status !== 'not_seen');
  if (!today || !METRICS[metricId]) return null;
  const own = lifts.find((l) => l.analysisId === analysis.id)?.id;
  const prior = seriesFor(sessions, analysis.movement, metricId).filter((p) => own == null || p.session.liftId !== own);
  const head = t('analysis.baseline.today', { value: metricText(metricId, today.value) });
  const best = bestOf(prior, metricId);
  if (!best) return today.best != null ? t('analysis.baseline.bestOnly', { head, best: metricText(metricId, today.best) }) : null;
  const lower = METRICS[metricId].lowerIsBetter;
  const last = prior.slice(-5);
  const avg = Math.round((last.reduce((sum, p) => sum + p.value, 0) / last.length) * 10) / 10;
  const average = last.length >= 2 ? t('analysis.baseline.average', { n: t(`analysis.baseline.n${last.length as 2 | 3 | 4 | 5}`), avg: metricText(metricId, avg) }) : null;
  const isBest = lower ? today.value <= best.value : today.value >= best.value;
  if (isBest) return average ? t('analysis.baseline.bestYetAverage', { head, average }) : t('analysis.baseline.bestYet', { head });
  const bestText = t('analysis.baseline.bestText', { best: metricText(metricId, best.value), date: shortDate(best.date) });
  return average ? t('analysis.baseline.withAverage', { head, best: bestText, average }) : t('analysis.baseline.withBest', { head, best: bestText });
}
