import { useRouter } from 'expo-router';
import { backendEnabled, syncConsent } from '../../src/data/backend';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useOnboarding } from '../../src/features/onboarding/store';

// Onboarding is three screens: this welcome, how to film (guide), add your first video (camera).
export default function WelcomeRoute() {
  const router = useRouter();
  const acceptConsent = useOnboarding((s) => s.acceptConsent);
  return (
    <WelcomeScreen
      onContinue={() => {
        acceptConsent();
        if (backendEnabled()) syncConsent().catch(() => undefined);
        router.push('/onboarding/guide');
      }}
    />
  );
}
