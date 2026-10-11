import { Stack } from 'expo-router';
import { colors } from '../../src/design/tokens';

export default function YouLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
