import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import RevealScreen from '../../src/features/analysis/RevealScreen';

export default function Reveal() {
  const { fixture, retest } = useLocalSearchParams<{ fixture?: string; retest?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture);
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  const analysis = load.analysis;
  return (
    <RevealScreen
      analysis={analysis}
      onDone={() => router.replace({ pathname: '/analysis/cue', params: retest ? { fixture: analysis.id, retest } : { fixture: analysis.id } })}
    />
  );
}
