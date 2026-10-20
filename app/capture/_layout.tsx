import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { prefetchPoseModels } from '../../src/data/onDevicePose';
import { colors } from '../../src/design/tokens';

export default function CaptureLayout() {
  useEffect(prefetchPoseModels, []);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
