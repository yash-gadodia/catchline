import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import PlayerScreen from '../../src/features/analysis/PlayerScreen';
import { openLiftActions } from '../../src/features/analysis/liftActions';
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
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  const share = () => router.push({ pathname: '/share', params: { fixture: analysis.id } });
  return (
    <PlayerScreen
      key={`${analysis.id}-${frame ?? ''}`}
      analysis={analysis}
      initialFrame={frame ? Number(frame) : undefined}
      onBack={back}
      // Compare targets are fixture variants, not the lifter's history: dev preview only.
      onCompare={__DEV__ ? () => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, mode: 'ghost' } }) : undefined}
      onShare={share}
      retestCueId={retest}
      onRetest={(id) => router.push(captureHref(`/capture?retest=${id}`) as Href)}
      onMore={() => openLiftActions(analysis, { onShare: share, onFilmAnother: () => router.push(captureHref('/capture') as Href) })}
    />
  );
}
