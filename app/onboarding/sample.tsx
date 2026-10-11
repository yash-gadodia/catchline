import { useRouter } from 'expo-router';
import { snatchSideon } from '../../src/analysis/fixtures';
import SampleScreen from '../../src/features/onboarding/SampleScreen';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function SampleRoute() {
  const router = useRouter();
  const { go } = useFlow('film');
  return <SampleScreen sample={snatchSideon} onBack={() => router.back()} onFilm={() => go('sample')} />;
}
