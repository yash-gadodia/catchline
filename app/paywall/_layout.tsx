import { Stack } from 'expo-router';
import { colors } from '../../src/design/tokens';

export default function PaywallLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'slide_from_bottom', contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="dev" options={{ animation: 'default' }} />
    </Stack>
  );
}
