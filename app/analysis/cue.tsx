import { Share } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CueScreen from '../../src/features/analysis/CueScreen';
import { captureHref, routeAfterAnalysis } from '../../src/features/paywall/hooks';
import { openLiftActions, reportHref } from '../../src/features/analysis/liftActions';
import { openReportInIntercom } from '../../src/data/intercom';
import { markStuck } from '../../src/features/library/repository';

export default function CueRoute() {
  const { fixture, why, retest } = useLocalSearchParams<{ fixture?: string; why?: string; retest?: string }>();
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
  const filmAgain = () => {
    back();
    if (!routeAfterAnalysis()) router.push(captureHref('/capture') as Href);
  };
  return (
    <CueScreen
      key={`${analysis.id}-${why ?? ''}`}
      analysis={analysis}
      initialWhy={why === '1'}
      retestCueId={retest}
      nav={{
        onTry: () => router.push({ pathname: '/analysis/player', params: retest ? { fixture: analysis.id, retest } : { fixture: analysis.id } }),
        onRetest: (id) => router.push(captureHref(`/capture?retest=${id}`) as Href),
        onStuck: (id) => {
          markStuck(id);
          router.push({ pathname: '/cue/[id]', params: { id } });
        },
        onNotForMe: back,
        onBack: back,
        onFilmAgain: filmAgain,
        onShare: () => router.push({ pathname: '/share', params: { fixture: analysis.id } }),
        onMore: () =>
          openLiftActions(analysis, {
            onShare: () => {
              if (analysis.cue) Share.share({ message: analysis.cue.text });
            },
            onFilmAnother: filmAgain,
            onReport: () =>
              void openReportInIntercom(analysis.id).then((opened) => {
                if (!opened) router.push(reportHref(analysis));
              }),
          }),
      }}
    />
  );
}
