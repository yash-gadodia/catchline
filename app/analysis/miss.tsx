import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import MissScreen from '../../src/features/analysis/MissScreen';

export default function MissRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const analysis = getAnalysis(fixture ?? 'snatch-mock-miss');
  return (
    <MissScreen
      analysis={analysis}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onCompare={() => router.push({ pathname: '/analysis/compare', params: { mode: 'side' } })}
    />
  );
}
