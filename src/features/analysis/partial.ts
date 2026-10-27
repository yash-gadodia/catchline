import type { Analysis, PathOnlyGate } from '../../analysis/types';
import { noCueCode } from '../../analysis/parse';
import { t } from '../../i18n';

const GATES: PathOnlyGate[] = ['no_reps', 'no_plate', 'no_body_scale', 'not_side_on', 'shoulders_cut_off'];

// What a partial result says in place of the cue: why it was held back and how to film it next time. A path-only
// result names the gate that failed (no phases to speak of).
export function noCueCopy(a: Analysis): { reason: string; tip: string } | null {
  const code = noCueCode(a);
  if (!code) return null;
  const deg = a.noCueReason?.offSideDeg;
  if (code === 'path_only') {
    const gate = GATES.find((g) => g === a.noCueReason?.gate) ?? 'no_reps';
    const reason =
      gate === 'not_side_on' && deg == null
        ? t('analysis.pathOnly.reason.not_side_on_noDeg')
        : t(`analysis.pathOnly.reason.${gate}` as const, { deg: Math.round(deg ?? 0) });
    return { reason, tip: t(`analysis.pathOnly.tip.${gate}` as const) };
  }
  const reason =
    code === 'off_side_on' && deg == null
      ? t('analysis.partial.reason.off_side_on_noDeg')
      : t(`analysis.partial.reason.${code}` as const, { deg: Math.round(deg ?? 0) });
  return { reason, tip: t(`analysis.partial.tip.${code}` as const) };
}
