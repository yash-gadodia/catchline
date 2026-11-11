import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import { newClip, useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import PrivacyScreen from '../../src/features/onboarding/PrivacyScreen';
import { hasConsent, useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';

type Params = { uri?: string; from?: string; fps?: string; duration?: string };

// Share-sheet entry (stub). A share extension hands the shared video over as
// catchline://capture/share?uri=…&from=WhatsApp and lands on the trim screen.
// Native setup it still needs: src/features/capture/share-sheet.md.
// With no uri a dev build uses a sample clip; a release build goes to capture.
export default function ShareRoute() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { draft, setDraft } = useCapture();
  const consent = useOnboarding((s) => s.consent);
  const acceptConsent = useOnboarding((s) => s.acceptConsent);
  const onboarded = useHydrated();
  const captureReady = useCaptureHydrated();
  const hydrated = onboarded && captureReady;

  useEffect(() => {
    if (!params.uri) {
      if (__DEV__) setDraft(demoClip('share'));
      else router.replace('/capture');
      return;
    }
    if (!captureReady) return;
    setDraft(
      newClip({
        uri: params.uri,
        durationS: Number(params.duration ?? 0),
        fps: params.fps ? Number(params.fps) : null,
        source: 'share',
        from: params.from,
      })
    );
  }, [params.uri, captureReady]);

  if (!hydrated || !draft || draft.source !== 'share') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!hasConsent(consent)) return <PrivacyScreen onContinue={() => acceptConsent()} />;
  return <Redirect href="/capture/trim" />;
}
