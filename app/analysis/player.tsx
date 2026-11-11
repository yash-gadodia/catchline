import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import PlayerScreen from '../../src/features/analysis/PlayerScreen';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import PlateFramesAsk from '../../src/features/plateFrames/PlateFramesAsk';
import { useLocalBody } from '../../src/features/analysis/useLocalBody';
import { localClipUri } from '../../src/data/localLifts';
import { liftTitle } from '../../src/features/library/derive';
import { useLift } from '../../src/features/library/repository';
import { openLiftActions, reportHref } from '../../src/features/analysis/liftActions';
import { openReportInIntercom } from '../../src/data/intercom';
import { captureHref } from '../../src/features/paywall/hooks';

export default function PlayerRoute() {
  const { fixture, frame } = useLocalSearchParams<{ fixture?: string; frame?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  // iOS 26 makes back a full-screen swipe, which would swallow the video's swipe between phases; back stays on the edge.
  useEffect(() => {
    const stacks = [navigation, navigation.getParent()];
    stacks.forEach((n) => n?.setOptions({ fullScreenGestureEnabled: false }));
    return () => stacks.forEach((n) => n?.setOptions({ fullScreenGestureEnabled: undefined }));
  }, [navigation]);
  const load = useAnalysis(fixture);
  const id = Array.isArray(fixture) ? fixture[0] : fixture;
  const clip = id ? localClipUri(id) : null;
  const lift = useLift(id);
  const body = useLocalBody(id, !!clip);
  // A 4.0 lift (its clip is kept) plays on the tracker and lands here straight from the tracking; a 3.x lift opens on its stills.
  // Leaving a 4.0 lift goes to the Lifts tab, not back to the clip's review.
  const back = () => (clip ? router.dismissTo('/') : router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  const share = () => router.push({ pathname: '/share', params: { fixture: analysis.id } });
  if (clip) {
    if (!body.ready) return <AnalysisPlaceholder status="loading" onBack={back} />;
    return (
      <>
        <TrackerScreen
          key={analysis.id}
          analysis={analysis}
          clipUri={clip}
          body={body.body}
          title={lift ? liftTitle(lift) : ''}
          onBack={back}
          onShare={share}
          onPathWrong={(at) => router.push({ pathname: '/analysis/correct', params: { fixture: analysis.id, frame: String(at) } })}
        />
        {analysis.failure ? null : <PlateFramesAsk liftId={analysis.id} />}
      </>
    );
  }
  return (
    <PlayerScreen
      key={`${analysis.id}-${frame ?? ''}`}
      analysis={analysis}
      initialFrame={frame ? Number(frame) : undefined}
      onBack={back}
      onShare={share}
      onMore={() =>
        openLiftActions(analysis, {
          onShare: share,
          onFilmAnother: () => router.push(captureHref('/capture') as Href),
          onReport: () =>
            void openReportInIntercom(analysis.id).then((opened) => {
              if (!opened) router.push(reportHref(analysis));
            }),
        })
      }
    />
  );
}
