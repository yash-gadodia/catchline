import { snatchMock } from '../../src/analysis/fixtures';
import WelcomeScreen from '../../src/features/onboarding/WelcomeScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function WelcomeRoute() {
  const film = useFlow('film');
  const imp = useFlow('import');
  return <WelcomeScreen sample={snatchMock} onStart={() => film.go('welcome')} onImport={() => imp.go('welcome')} />;
}
