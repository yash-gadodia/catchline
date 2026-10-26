import { useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { fmt, movementLabel } from '../../src/analysis/format';
import FailureScreen, { type Share } from '../../src/features/library/FailureScreen';
import { FAILURE_COPY, failureMessage, type FailureAction, type FailureReason } from '../../src/features/library/failures';
import { useLift } from '../../src/features/library/repository';
import { submitDraft } from '../../src/features/capture/submit';
import { localClipUri } from '../../src/data/localLifts';
import { shareFailedClip } from '../../src/data/shareClip';
import { t } from '../../src/i18n';

// A failed lift by id; `?reason=` previews any failure variant (dev entry). The
// design header for an unknown lift is a dev preview only.
export default function FailureRoute() {
  // `?share=1` previews the send-this-clip line (dev entry).
  const { id, reason, native, share: previewShare } = useLocalSearchParams<{ id: string; reason?: string; native?: string; share?: string }>();
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
  const [share, setShare] = useState<Pick<Share, 'state' | 'fraction'>>({ state: 'idle', fraction: 0 });
  const canShare = (__DEV__ && previewShare === '1') || (id ? localClipUri(id) !== null : false);
  const onSend = () => {
    setShare({ state: 'sending', fraction: 0 });
    shareFailedClip(id, lift?.failure?.code ?? null, (fraction) => setShare({ state: 'sending', fraction })).then(
      () => setShare({ state: 'sent', fraction: 1 }),
      () => setShare({ state: 'failed', fraction: 0 })
    );
  };
  return (
    <FailureScreen
      reason={r}
      header={header}
      refCode={(id ?? '').slice(0, 7)}
      detail={detail}
      share={canShare ? { ...share, onSend } : undefined}
      onAction={onAction}
    />
  );
}
