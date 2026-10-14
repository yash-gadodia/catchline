import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import ImportScreen from '../../src/features/capture/ImportScreen';
import { pickClip } from '../../src/features/capture/pick';
import { useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import { submitClip, toSubmission } from '../../src/features/capture/submit';
import { hasConsent, useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';

// Dev link: ?demo=1 loads the design's long muscle-up clip without a picker.
export default function ImportRoute() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const router = useRouter();
  const onboarded = useHydrated();
  const captureReady = useCaptureHydrated();
  const hydrated = onboarded && captureReady;
  const consent = useOnboarding((s) => s.consent);
  const units = useOnboarding((s) => s.units);
  const { draft, setDraft, updateDraft, movement, setMovement, lastWeight } = useCapture();
  const [ready, setReady] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/capture'));

  useEffect(() => {
    if (!hydrated) return;
    if (demo === '1') {
      setDraft(demoClip('import'));
      setReady(true);
      return;
    }
    if (!hasConsent(consent)) {
      router.replace('/onboarding/privacy?intent=import');
      return;
    }
    pickClip(movement).then((clip) => {
      if (!clip) return leave();
      setDraft(clip);
      setReady(true);
    }, () => {
      Alert.alert("Couldn't open that video", 'Try again, or pick a clip saved on this phone.');
      leave();
    });
  }, [hydrated]);

  if (!ready || !draft) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <ImportScreen
      clip={draft}
      onCancel={leave}
      onMovement={(m) => {
        setMovement(m);
        updateDraft({ movement: m });
      }}
      onTrim={() => router.push('/capture/trim')}
      onSet={(setIndex) => updateDraft({ setIndex, rep: 'all' })}
      onRep={(rep) => updateDraft({ rep })}
      onAnalyse={() => submitClip(toSubmission(draft, lastWeight, units))}
    />
  );
}
