import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import PlayerScreen from '../../src/features/analysis/PlayerScreen';

export default function PlayerRoute() {
  const { fixture, frame } = useLocalSearchParams<{ fixture?: string; frame?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  return (
    <PlayerScreen
      key={`${analysis.id}-${frame ?? ''}`}
      analysis={analysis}
      initialFrame={frame ? Number(frame) : undefined}
      onBack={back}
      // Compare targets are fixture variants, not the lifter's history: dev preview only.
      onCompare={__DEV__ ? () => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, mode: 'ghost' } }) : undefined}
      onShare={() => router.push({ pathname: '/share', params: { fixture: analysis.id } })}
    />
  );
}
