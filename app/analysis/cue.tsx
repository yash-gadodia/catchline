import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CueScreen from '../../src/features/analysis/CueScreen';
import { captureHref, routeAfterAnalysis } from '../../src/features/paywall/hooks';

export default function CueRoute() {
  const { fixture, why } = useLocalSearchParams<{ fixture?: string; why?: string }>();
  const router = useRouter();
  const load = useAnalysis(fixture);
  // Leaving the result lands on the Lifts tab: the capture screens beneath
  // still hold the clip just analysed, and going back there invites sending
  // it twice.
  const back = () => {
    const funnel = routeAfterAnalysis();
    if (funnel) router.replace(funnel);
    else router.dismissTo('/');
  };
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  return (
    <CueScreen
      key={`${analysis.id}-${why ?? ''}`}
      analysis={analysis}
      initialWhy={why === '1'}
      nav={{
        onTry: () => router.push({ pathname: '/analysis/player', params: { fixture: analysis.id } }),
        onNotForMe: back,
        onBack: back,
        onFilmAgain: () => {
          back();
          if (!routeAfterAnalysis()) router.push(captureHref('/capture') as Href);
        },
      }}
    />
  );
}
