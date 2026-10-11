import { useRouter } from 'expo-router';
import { SAMPLE_ROUTE, snatchMock } from '../../src/analysis/fixtures';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function WelcomeRoute() {
  const film = useFlow('film');
  const imp = useFlow('import');
  const router = useRouter();
  return (
    <WelcomeScreen
      sample={snatchMock}
      onStart={() => film.go('welcome')}
      onImport={() => imp.go('welcome')}
      onSample={() => router.push(SAMPLE_ROUTE)}
    />
  );
}
