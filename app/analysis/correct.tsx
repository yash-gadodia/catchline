import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CorrectScreen from '../../src/features/plateFrames/CorrectScreen';
import { localClipUri } from '../../src/data/localLifts';

// From the tracker's "The path is wrong": the lifter marks the plate on the frame they were on.
export default function CorrectRoute() {
  const { fixture, frame } = useLocalSearchParams<{ fixture?: string; frame?: string }>();
  const router = useRouter();
  // The mark is a drag on the picture: iOS's swipe-back (full screen on iOS 26) would take it, so Back is the button.
  const navigation = useNavigation();
  useEffect(() => {
    const stacks = [navigation, navigation.getParent()];
    stacks.forEach((n) => n?.setOptions({ gestureEnabled: false, fullScreenGestureEnabled: false }));
    return () => stacks.forEach((n) => n?.setOptions({ gestureEnabled: undefined, fullScreenGestureEnabled: undefined }));
  }, [navigation]);
  const id = Array.isArray(fixture) ? fixture[0] : fixture;
  const load = useAnalysis(id);
  const clip = id ? localClipUri(id) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready' || !clip || !id) return <AnalysisPlaceholder status={load.status === 'ready' ? 'loading' : load.status} onBack={back} />;
  return <CorrectScreen liftId={id} clipUri={clip} frame={Math.max(0, Math.round(Number(frame) || 0))} video={load.analysis.video} onDone={back} />;
}
