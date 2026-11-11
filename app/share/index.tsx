import { Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import { hasFeature } from '../../src/features/paywall/entitlements';
import { useLocalBody } from '../../src/features/analysis/useLocalBody';
import { localClipUri } from '../../src/data/localLifts';
import ShareScreen from '../../src/features/share/ShareScreen';
import TrackShareScreen from '../../src/features/share/TrackShareScreen';
import { localClipFor } from '../../src/features/share/localClips';
import { SHARE_ASPECTS } from '../../src/features/share/overlay';

export default function ShareRoute() {
  // Dev links: &clip=<file uri>&start=<s> stand in for the lifter's own clip (simulator QA).
  const p = useLocalSearchParams<{ fixture?: string; aspect?: string; tier?: string; clip?: string; start?: string }>();
  const router = useRouter();
  const isPro = usePurchases((s) => hasFeature(s.tier, 'watermarkFreeExport'));
  const load = useAnalysis(p.fixture);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const id = Array.isArray(p.fixture) ? p.fixture[0] : p.fixture;
  // A 4.0 lift keeps its clip: it shares the clip itself with the tracker's overlay, not the cue card.
  const kept = id ? localClipUri(id) : null;
  const body = useLocalBody(id, !!kept);
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  const analysis = load.analysis;
  if (kept) {
    if (!body.ready) return <AnalysisPlaceholder status="loading" onBack={back} />;
    return <TrackShareScreen key={analysis.id} analysis={analysis} body={body.body} clipUri={kept} watermark={p.tier ? p.tier !== 'pro' : !isPro} onBack={back} />;
  }
  const clip = __DEV__ && p.clip ? { uri: p.clip, startS: Number(p.start ?? 0) } : localClipFor(analysis.id);
  return (
    <ShareScreen
      key={`${analysis.id}-${p.aspect ?? ''}-${p.tier ?? ''}`}
      analysis={analysis}
      pro={p.tier ? p.tier === 'pro' : isPro}
      clip={clip}
      canRenderVideo={Platform.OS === 'ios'}
      initialAspect={SHARE_ASPECTS.find((a) => a === p.aspect) ?? '9:16'}
      onBack={back}
    />
  );
}
