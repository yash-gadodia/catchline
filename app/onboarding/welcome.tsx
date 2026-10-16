import { useRouter, type Href } from 'expo-router';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function WelcomeRoute() {
  const imp = useFlow('import');
  const router = useRouter();
  return <WelcomeScreen onDemo={() => router.push('/onboarding/demo' as Href)} onImport={() => imp.go('welcome')} />;
}
