import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import CueScreen from '../../src/features/analysis/CueScreen';
import { routeAfterAnalysis } from '../../src/features/paywall/hooks';

export default function CueRoute() {
  const { fixture, why } = useLocalSearchParams<{ fixture?: string; why?: string }>();
  const router = useRouter();
  const analysis = getAnalysis(fixture);
  const back = () => {
    const funnel = routeAfterAnalysis();
    if (funnel) router.replace(funnel);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <CueScreen
      key={`${analysis.id}-${why ?? ''}`}
      analysis={analysis}
      initialWhy={why === '1'}
      nav={{
        onTry: () => router.push({ pathname: '/analysis/player', params: { fixture: analysis.id } }),
        onNotForMe: back,
        onBack: back,
        onFilmAgain: back,
      }}
    />
  );
}
