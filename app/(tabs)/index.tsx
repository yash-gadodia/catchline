import { useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { removeLift, syncLibrary } from '../../src/data/library';
import { t } from '../../src/i18n';
import { liftLink } from '../../src/features/library/derive';
import LiftsScreen from '../../src/features/library/LiftsScreen';
import { captureHref } from '../../src/features/paywall/hooks';
import { offerQueuedFeedback } from '../../src/features/feedback/ask';
import { maybeReaskForPush } from '../../src/features/notifications/ask';

export default function LiftsRoute() {
  const router = useRouter();
  // The list follows the server whenever the lifter looks at it: a lift deleted on another phone leaves it (#206).
  useFocusEffect(
    useCallback(() => {
      syncLibrary().catch(() => undefined);
      // back from a lift's result: the notification ask after the first one, else the feedback ask when it is due
      void maybeReaskForPush().then((asked) => asked || offerQueuedFeedback());
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') syncLibrary().catch(() => undefined);
      });
      return () => sub.remove();
    }, [])
  );
  const unlock = () => router.push('/paywall' as Href);
  return (
    <LiftsScreen
      nav={{
        onOpen: (lift) => {
          const link = liftLink(lift);
          if (link) router.push(link);
          else if (lift.status === 'queued') unlock();
          // waiting for the lift tracking now: its row says so, and the in-flight bar opens the one tracking
          else if (lift.waiting) return;
          // tracked on another phone (or before a reinstall): its video is not here, and paying would not bring it (#158)
          else Alert.alert(t('library.lifts.elsewhereTitle'), t('library.lifts.elsewhereBody'));
        },
        onUnlock: unlock,
        onRecord: () => router.push(captureHref('/capture') as Href),
        onImport: () => router.push(captureHref('/capture/import') as Href),
        onDetails: (lift) => router.push({ pathname: '/analysis/details', params: { id: lift.analysisId ?? lift.id } } as Href),
        onDelete: (lift) =>
          Alert.alert(t('library.lifts.deleteTitle'), t('library.lifts.deleteBody'), [
            { text: t('library.lifts.deleteCancel'), style: 'cancel' },
            {
              text: t('library.lifts.deleteConfirm'),
              style: 'destructive',
              onPress: () =>
                removeLift(lift.id)
                  .then(() => syncLibrary())
                  .catch(() => Alert.alert(t('library.lifts.deleteFailed'))),
            },
          ]),
      }}
    />
  );
}
