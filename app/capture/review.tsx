import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip, isDemoKind } from '../../src/features/capture/demo';
import ReviewScreen from '../../src/features/capture/ReviewScreen';
import { useCapture } from '../../src/features/capture/store';
import { submitClip, toSubmission } from '../../src/features/capture/submit';
import { useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';

// Dev links: ?demo=ok|override|cutoff|share loads a sample clip (dev builds only).
// In a release build no draft means nothing to review: back to capture.
export default function ReviewRoute() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const router = useRouter();
  const { draft, setDraft, updateDraft, lastWeight, setLastWeight, setMovement } = useCapture();
  const units = useOnboarding((s) => s.units);

  useEffect(() => {
    if (!__DEV__) {
      if (!draft) router.replace('/capture');
      return;
    }
    if (isDemoKind(demo)) setDraft(demoClip(demo));
    else if (!draft) setDraft(demoClip('ok'));
  }, [demo]);

  if (!draft) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <ReviewScreen
      clip={draft}
      units={units}
      weight={lastWeight}
      onWeight={setLastWeight}
      onMovement={(m) => {
        setMovement(m);
        updateDraft({ movement: m, movementGuessed: false });
      }}
      onRetake={() => (router.canGoBack() ? router.back() : router.replace('/capture'))}
      onTrim={() => router.push('/capture/trim')}
      onAnalyse={() => submitClip(toSubmission(draft, lastWeight, units))}
    />
  );
}
