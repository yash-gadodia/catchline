import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNoSwipeBack } from '../../src/lib/useNoSwipeBack';
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
  useNoSwipeBack();
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
