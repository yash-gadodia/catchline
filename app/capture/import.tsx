import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import ImportEmpty from '../../src/features/capture/ImportEmpty';
import { pickClip } from '../../src/features/capture/pick';
import { useCapture } from '../../src/features/capture/store';
import { hasConsent, useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';
import { t } from '../../src/i18n';

// Opens the photo library; the picked clip goes straight to the trim screen.
// Dev link: ?demo=1 loads a sample clip without a picker (dev builds only).
export default function ImportRoute() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const consent = useOnboarding((s) => s.consent);
  const setDraft = useCapture((s) => s.setDraft);
  // Cancelling the picker lands here, not on the viewfinder: import is the main way in.
  const [empty, setEmpty] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const pick = () => {
    setEmpty(false);
    pickClip().then((clip) => {
      if (!clip) return setEmpty(true);
      setDraft(clip);
      router.replace('/capture/trim');
    }, () => {
      Alert.alert(t('capture.import.failedTitle'), t('capture.import.failedBody'));
      setEmpty(true);
    });
  };

  useEffect(() => {
    if (!hydrated) return;
    if (__DEV__ && demo === '1') {
      setDraft(demoClip('import'));
      router.replace('/capture/trim');
      return;
    }
    if (!hasConsent(consent)) {
      router.replace('/onboarding/privacy?intent=import');
      return;
    }
    pick();
  }, [hydrated]);

  if (empty) return <ImportEmpty onPick={pick} onRecord={() => router.replace('/capture')} onCancel={leave} />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
