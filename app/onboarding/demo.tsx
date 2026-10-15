import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import DemoScreen from '../../src/features/onboarding/DemoScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';
import { captureHref } from '../../src/features/paywall/hooks';

// First run: continues into account -> consent -> import (or the film path).
// `?from=app` (You, the empty Lifts tab) goes straight to capture.
export default function DemoRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const imp = useFlow('import');
  const film = useFlow('film');
  const inApp = from === 'app';
  return (
    <DemoScreen
      onImport={() => (inApp ? router.replace(captureHref('/capture/import') as Href) : imp.go('demo'))}
      onRecord={() => (inApp ? router.replace(captureHref('/capture') as Href) : film.go('demo'))}
    />
  );
}
