import { Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '../../src/design/tokens';
import { UpdateRequired } from '../../src/features/you/GlobalStates';
import { useRequireUpdate } from '../../src/features/you/updateFlag';
import { APP_STORE_URL } from '../../src/lib/links';

export default function CaptureLayout() {
  const router = useRouter();
  if (useRequireUpdate()) {
    return <UpdateRequired onUpdate={() => Linking.openURL(APP_STORE_URL).catch(() => undefined)} onBack={() => router.back()} />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
