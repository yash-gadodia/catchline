import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import { useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import { submitDraft } from '../../src/features/capture/submit';
import TrimScreen from '../../src/features/capture/TrimScreen';
import { useNoSwipeBack } from '../../src/lib/useNoSwipeBack';
import { useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';

// The one screen between picking a clip and tracking it: trim to the lift, add the load if wanted, Track.
// With no clip a dev build shows the sample; a release build goes back to capture.
export default function TrimRoute() {
  const router = useRouter();
  const { draft, setDraft, updateDraft, lastWeight, setLastWeight } = useCapture();
  const ready = useCaptureHydrated();
  const units = useOnboarding((s) => s.units);
  useNoSwipeBack();
  useEffect(() => {
    if (draft) return;
    if (__DEV__) setDraft(demoClip('ok'));
    else router.replace('/capture');
  }, []);
  if (!draft || !ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <TrimScreen
      clip={draft}
      units={units}
      weight={lastWeight}
      onWeight={setLastWeight}
      onCancel={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onTrack={(trim) => {
        // the plate is found by the tracker; the lifter adjusts it afterwards from the player if it is wrong
        updateDraft({ trim, plateMark: null });
        submitDraft();
      }}
    />
  );
}
