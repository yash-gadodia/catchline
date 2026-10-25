import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { failureHelp, openHelpInIntercom } from '../../src/data/intercom';
import { fmt, movementLabel } from '../../src/analysis/format';
import FailureScreen from '../../src/features/library/FailureScreen';
import { FAILURE_COPY, failureMessage, type FailureAction, type FailureReason } from '../../src/features/library/failures';
import { useLift } from '../../src/features/library/repository';
import { submitDraft } from '../../src/features/capture/submit';
import { t } from '../../src/i18n';

// A failed lift by id; `?reason=` previews any failure variant (dev entry). The
// design header for an unknown lift is a dev preview only.
export default function FailureRoute() {
  const { id, reason, native } = useLocalSearchParams<{ id: string; reason?: string; native?: string }>();
  const router = useRouter();
  const lift = useLift(id);
  const r = (reason && reason in FAILURE_COPY ? reason : lift?.failure?.reason ?? 'unknown') as FailureReason;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = lift
    ? [movementLabel(lift.movement), lift.loadKg != null ? `${fmt(lift.loadKg)} kg` : null, lift.failure?.frame != null ? t('library.failure.frame', { frame: lift.failure.frame }) : null]
        .filter(Boolean)
        .join(' · ')
    : __DEV__
      ? 'Snatch · 62.5 kg'
      : '';
  const stored = lift?.failure?.reason === r ? failureMessage(lift.failure) : undefined;
  const detail = native ?? (stored && stored !== FAILURE_COPY[r].title ? stored : undefined);
  const partial = lift?.analysisId ?? (__DEV__ ? 'snatch-mock' : null);
  const onAction = (a: FailureAction) => {
    if (a === 'retake') router.push('/capture' as Href);
    else if (a === 'import') router.push('/capture/import' as Href);
    else if (a === 'pickA' || a === 'pickB' || a === 'reanalyse') {
      if (!submitDraft({ replace: true })) router.replace('/capture');
    } else if (a === 'partial' && partial) router.replace({ pathname: '/analysis/player', params: { fixture: partial } });
    else back();
  };
  const code = lift?.failure?.code ?? r;
  const onHelp = () =>
    void openHelpInIntercom(failureHelp(code, lift?.movement ?? 'unknown', id)).then((opened) => {
      if (!opened) router.push({ pathname: '/report', params: { lift: id, context: `failure: ${code}` } });
    });
  return <FailureScreen reason={r} header={header} refCode={(id ?? '').slice(0, 7)} detail={detail} onAction={onAction} onHelp={onHelp} />;
}
