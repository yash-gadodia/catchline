import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CompareScreen, { type ComparedLift } from '../../src/features/analysis/CompareScreen';
import { localClipUri, readLocalAnalysis, readLocalBody } from '../../src/data/localLifts';
import { liftTitle } from '../../src/features/library/derive';
import { useLibrary } from '../../src/features/library/repository';

// Two tracked lifts side by side: `a` is the lift the lifter came from, `b` the earlier one of the same kind.
export default function CompareRoute() {
  const router = useRouter();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { lifts } = useLibrary();
  const [pair, setPair] = useState<[ComparedLift, ComparedLift] | 'missing' | null>(null);
  useEffect(() => {
    let live = true;
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
  return <CompareScreen today={pair[0]} earlier={pair[1]} onBack={back} />;
}
