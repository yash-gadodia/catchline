import { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import PlayerScreen from '../../src/features/analysis/PlayerScreen';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import type { Body } from '../../src/analysis/device/tracking';
import { localClipUri, readLocalBody } from '../../src/data/localLifts';
import { liftTitle } from '../../src/analysis/format';
import { useBestLift } from '../../src/features/analysis/bestLift';
import { openLiftActions, reportHref } from '../../src/features/analysis/liftActions';
import { openReportInIntercom } from '../../src/data/intercom';
import { captureHref } from '../../src/features/paywall/hooks';

export default function PlayerRoute() {
  const { fixture, frame, retest } = useLocalSearchParams<{ fixture?: string; frame?: string; retest?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  // iOS 26 makes back a full-screen swipe, which would swallow the video's swipe between phases; back stays on the edge.
  useEffect(() => {
    const stacks = [navigation, navigation.getParent()];
    stacks.forEach((n) => n?.setOptions({ fullScreenGestureEnabled: false }));
    return () => stacks.forEach((n) => n?.setOptions({ fullScreenGestureEnabled: undefined }));
  }, [navigation]);
  const load = useAnalysis(fixture);
  const best = useBestLift(load.status === 'ready' ? load.analysis : null);
  const id = Array.isArray(fixture) ? fixture[0] : fixture;
  const clip = id ? localClipUri(id) : null;
  const [body, setBody] = useState<{ id: string; body: Body | null } | null>(null);
  useEffect(() => {
    if (!id || !clip) return;
    let live = true;
    readLocalBody(id).then(
      (b) => live && setBody({ id, body: b }),
      () => live && setBody({ id, body: null }),
    );
    return () => {
      live = false;
    };
  }, [id, clip]);
  // A 4.0 lift lands here straight from the analysis: leaving goes to the Lifts tab, not back to the clip's review.
  const back = () => (clip ? router.dismissTo('/') : router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  const share = () => router.push({ pathname: '/share', params: { fixture: analysis.id } });
  if (clip) {
    if (!body || body.id !== id) return <AnalysisPlaceholder status="loading" onBack={back} />;
    return <TrackerScreen key={analysis.id} analysis={analysis} clipUri={clip} body={body.body} title={liftTitle(analysis)} onBack={back} onShare={share} />;
  }
  return (
    <PlayerScreen
      key={`${analysis.id}-${frame ?? ''}`}
      analysis={analysis}
      initialFrame={frame ? Number(frame) : undefined}
      onBack={back}
      // Today's path on the lifter's best made lift; without one, the fixture compare stays a dev preview.
      onCompare={
        best?.analysisId
          ? () => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, best: best.analysisId } })
          : __DEV__
            ? () => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, mode: 'ghost' } })
            : undefined
      }
      onShare={share}
      retestCueId={retest}
      onRetest={(id) => router.push(captureHref(`/capture?retest=${id}`) as Href)}
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
