import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import { useCapture, withTrim } from '../../src/features/capture/store';
import { submitDraft } from '../../src/features/capture/submit';
import TrimScreen from '../../src/features/capture/TrimScreen';
import { colors } from '../../src/design/tokens';

// ?then=analyse: Analyse sent a clip too long for one lift here; Done analyses it as trimmed.
export default function TrimRoute() {
  const router = useRouter();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const { draft, setDraft } = useCapture();
  useEffect(() => {
    if (draft) return;
    if (__DEV__) setDraft(demoClip('ok'));
    else router.replace('/capture');
  }, []);
  if (!draft) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/capture/review'));
  return (
    <TrimScreen
      clip={draft}
      nudge={then === 'analyse'}
      onCancel={close}
      onDone={(trim) => {
        setDraft(withTrim(draft, trim));
        if (then === 'analyse') submitDraft({ replace: true, trimmed: true });
        else close();
      }}
    />
  );
}
