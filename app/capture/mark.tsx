import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import MarkScreen from '../../src/features/capture/MarkScreen';
import { useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import { submitDraft } from '../../src/features/capture/submit';
import { colors } from '../../src/design/tokens';

// Between trimming and tracking: the lifter marks the plate. A clip with no file (the dev sample) has nothing to mark.
export default function MarkRoute() {
  const router = useRouter();
  const { draft, updateDraft } = useCapture();
  const ready = useCaptureHydrated();
  const uri = draft?.uri ?? null;
  // The mark is a drag on the picture: iOS's swipe-back (full screen on iOS 26) would take it, so Back is the button.
  const navigation = useNavigation();
  useEffect(() => {
    const stacks = [navigation, navigation.getParent()];
    stacks.forEach((n) => n?.setOptions({ gestureEnabled: false, fullScreenGestureEnabled: false }));
    return () => stacks.forEach((n) => n?.setOptions({ gestureEnabled: undefined, fullScreenGestureEnabled: undefined }));
  }, [navigation]);
  useEffect(() => {
    if (ready && !uri) submitDraft({ replace: true });
  }, [ready, uri]);
  if (!draft || !ready || !uri) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <MarkScreen
      clip={{ ...draft, uri }}
      onBack={() => router.back()}
      onTrack={(plateMark) => {
        updateDraft({ plateMark });
        submitDraft({ replace: true });
      }}
    />
  );
}
