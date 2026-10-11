import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import { useCapture, withTrim } from '../../src/features/capture/store';
import TrimScreen from '../../src/features/capture/TrimScreen';
import { colors } from '../../src/design/tokens';

export default function TrimRoute() {
  const router = useRouter();
  const { draft, setDraft } = useCapture();
  useEffect(() => {
    if (!draft) setDraft(demoClip('ok'));
  }, []);
  if (!draft) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/capture/review'));
  return (
    <TrimScreen
      clip={draft}
      onCancel={close}
      onDone={(trim) => {
        setDraft(withTrim(draft, trim));
        close();
      }}
    />
  );
}
