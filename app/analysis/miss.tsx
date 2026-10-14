import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import MissScreen from '../../src/features/analysis/MissScreen';

export default function MissRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture ?? 'snatch-mock-miss');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  return (
    <MissScreen
      analysis={load.analysis}
      onBack={back}
      onCompare={() => router.push({ pathname: '/analysis/compare', params: { mode: 'side' } })}
    />
  );
}
