import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CompareScreen, { type ComparedLift } from '../../src/features/analysis/CompareScreen';
import { localClipUri, readLocalAnalysis, readLocalBody } from '../../src/data/localLifts';
import { liftTitle } from '../../src/features/library/derive';
import { useLibrary } from '../../src/features/library/repository';
import { useLiftNames } from '../../src/features/library/liftNames';
import { detailsOf, useLiftDetails } from '../../src/features/library/liftDetails';
import { sameKindLifts } from '../../src/features/analysis/compare';

// Two tracked lifts side by side: `a` is the lift the lifter came from, `b` another of the same kind (the last one
// before it to begin with; the lifter can pick any other whose clip is still on the phone).
const MAX_OTHERS = 20;
export default function CompareRoute() {
  const router = useRouter();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { lifts } = useLibrary();
  const shapes = useLiftNames((s) => s.shapes);
  const details = useLiftDetails((s) => s.details);
  const others = sameKindLifts(lifts, shapes, a)
    .flatMap((l) => (l.analysisId && localClipUri(l.analysisId) ? [{ id: l.analysisId, title: [detailsOf(details, l.analysisId).name, liftTitle(l)].filter(Boolean).join(' · ') }] : []))
    .slice(0, MAX_OTHERS);
  const [pair, setPair] = useState<[ComparedLift, ComparedLift] | 'missing' | null>(null);
  useEffect(() => {
    let live = true;
    setPair(null);
    const load = async (id: string | undefined): Promise<ComparedLift | null> => {
      const clipUri = id ? localClipUri(id) : null;
      if (!id || !clipUri) return null;
      const [analysis, body] = await Promise.all([readLocalAnalysis(id), readLocalBody(id)]);
      const lift = lifts.find((l) => (l.analysisId ?? l.id) === id);
      return analysis ? { analysis, body, clipUri, title: lift ? liftTitle(lift) : '' } : null;
    };
    Promise.all([load(a), load(b)]).then(
      ([x, y]) => live && setPair(x && y ? [x, y] : 'missing'),
      () => live && setPair('missing'),
    );
    return () => {
      live = false;
    };
  }, [a, b]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (pair === null) return <AnalysisPlaceholder status="loading" onBack={back} />;
  if (pair === 'missing') return <AnalysisPlaceholder status="missing" onBack={back} />;
  return <CompareScreen key={b} today={pair[0]} earlier={pair[1]} onBack={back} others={others} picked={b} onPick={(id) => router.setParams({ b: id })} />;
}
