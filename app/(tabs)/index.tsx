import { Alert } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { syncLibrary } from '../../src/data/library';
import { deleteLift } from '../../src/lib/api';
import { t } from '../../src/i18n';
import { liftLink } from '../../src/features/library/derive';
import LiftsScreen from '../../src/features/library/LiftsScreen';
import { captureHref } from '../../src/features/paywall/hooks';

export default function LiftsRoute() {
  const router = useRouter();
  const unlock = () => router.push('/paywall' as Href);
  return (
    <LiftsScreen
      nav={{
        onOpen: (lift) => {
          const link = liftLink(lift);
          if (link) router.push(link);
          else unlock();
        },
        onRetake: () => router.push(captureHref('/capture') as Href),
        onUnlock: unlock,
        onRecord: () => router.push(captureHref('/capture') as Href),
        onImport: () => router.push(captureHref('/capture/import') as Href),
        onDemo: () => router.push('/onboarding/demo?from=app' as Href),
        onCue: (id) => router.push({ pathname: '/cue/[id]', params: { id } }),
        onDelete: (lift) =>
          Alert.alert(t('library.lifts.deleteTitle'), t('library.lifts.deleteBody'), [
            { text: t('library.lifts.deleteCancel'), style: 'cancel' },
            {
              text: t('library.lifts.deleteConfirm'),
              style: 'destructive',
              onPress: () =>
                deleteLift(lift.id)
                  .then(() => syncLibrary())
                  .catch(() => Alert.alert(t('library.lifts.deleteFailed'))),
            },
          ]),
      }}
    />
  );
}
