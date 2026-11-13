import { useLocalSearchParams, useRouter } from 'expo-router';
import { backendEnabled, syncConsent } from '../../src/data/backend';
import PrivacyScreen from '../../src/features/onboarding/PrivacyScreen';
import { useOnboarding } from '../../src/features/onboarding/store';

// Not an onboarding step: capture sends a lifter here when the consent on this
// phone is missing or older than CONSENT_VERSION, then they go on to what they opened.
export default function PrivacyRoute() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const router = useRouter();
  const acceptConsent = useOnboarding((s) => s.acceptConsent);
  return (
    <PrivacyScreen
      onContinue={() => {
        acceptConsent();
        if (backendEnabled()) syncConsent().catch(() => undefined);
        router.replace(intent === 'import' ? '/capture/import' : '/capture');
      }}
    />
  );
}
