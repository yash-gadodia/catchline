import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import LaunchScreen from '../../src/features/onboarding/LaunchScreen';
import { useOnboarding } from '../../src/features/onboarding/store';
import { parseIntent, useFlow } from '../../src/features/onboarding/useFlow';

const HOLD_MS = 900;

export default function LaunchRoute() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { go } = useFlow(parseIntent(intent));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      timer = setTimeout(() => go('launch'), HOLD_MS);
    };
    if (useOnboarding.persist.hasHydrated()) advance();
    const unsub = useOnboarding.persist.onFinishHydration(advance);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return <LaunchScreen />;
}
