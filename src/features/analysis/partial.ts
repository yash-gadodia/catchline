import type { Analysis } from '../../analysis/types';
import { noCueCode } from '../../analysis/parse';
import { t } from '../../i18n';

// What a partial result says in place of the cue: why it was held back and how to film it next time.
export function noCueCopy(a: Analysis): { reason: string; tip: string } | null {
  const code = noCueCode(a);
  if (!code) return null;
  const deg = a.noCueReason?.offSideDeg;
  const reason =
    code === 'off_side_on' && deg == null
      ? t('analysis.partial.reason.off_side_on_noDeg')
      : t(`analysis.partial.reason.${code}` as const, { deg: Math.round(deg ?? 0) });
  return { reason, tip: t(`analysis.partial.tip.${code}` as const) };
}
