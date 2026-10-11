import { useLocalSearchParams } from 'expo-router';
import { backendEnabled, syncConsent } from '../../src/data/backend';
import PrivacyScreen from '../../src/features/onboarding/PrivacyScreen';
import { useOnboarding } from '../../src/features/onboarding/store';
import { parseIntent, useFlow } from '../../src/features/onboarding/useFlow';

export default function PrivacyRoute() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { go } = useFlow(parseIntent(intent));
  const consent = useOnboarding((s) => s.consent);
  const acceptConsent = useOnboarding((s) => s.acceptConsent);
  return (
    <PrivacyScreen
      initialImprove={consent?.improveAccuracy ?? false}
      onContinue={(improve) => {
        acceptConsent(improve);
        if (backendEnabled()) syncConsent().catch(() => undefined);
        go('privacy', { consented: true });
      }}
    />
  );
}
