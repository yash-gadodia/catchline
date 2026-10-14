import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import MissScreen from '../../src/features/analysis/MissScreen';

export default function MissRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  return (
    <MissScreen
      analysis={analysis}
      onBack={back}
      // Compare targets are fixture variants, not the lifter's history: dev preview only.
      onCompare={__DEV__ ? () => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, mode: 'side' } }) : undefined}
    />
  );
}
