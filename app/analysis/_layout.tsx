import { Stack } from 'expo-router';
import { colors } from '../../src/design/tokens';

export default function AnalysisLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
