import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { localClipUri } from '../../src/data/localLifts';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import RevealScreen from '../../src/features/analysis/RevealScreen';
import { maybeReaskForPush } from '../../src/features/notifications/ask';

export default function Reveal() {
  const { fixture, retest } = useLocalSearchParams<{ fixture?: string; retest?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture);
  const id = Array.isArray(fixture) ? fixture[0] : fixture;
  // A 4.0 lift (its clip is kept) opens on the video player.
  if (id && localClipUri(id)) return <Redirect href={{ pathname: '/analysis/player', params: { fixture: id } }} />;
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  const analysis = load.analysis;
  return (
    <RevealScreen
      analysis={analysis}
      onDone={() => {
        void maybeReaskForPush();
        router.replace({ pathname: '/analysis/cue', params: retest ? { fixture: analysis.id, retest } : { fixture: analysis.id } });
      }}
    />
  );
}
