import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { COMPARE_TARGETS } from '../../src/analysis/fixtures';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CompareScreen, { type CompareMode } from '../../src/features/analysis/CompareScreen';

// The "Your best" / "Last session" targets are fixture variants of the demo
// snatch, not the lifter's history, so compare is a dev preview until it has
// real targets (TASKS.md).
export default function CompareRoute() {
  const params = useLocalSearchParams<{ fixture?: string; mode?: CompareMode }>();
  if (!__DEV__) return <Redirect href="/" />;
  return <Compare key={`${params.fixture ?? ''}-${params.mode ?? ''}`} fixture={params.fixture} initialMode={params.mode} />;
}

function Compare({ fixture, initialMode }: { fixture?: string; initialMode?: CompareMode }) {
  const router = useRouter();
  const load = useAnalysis(fixture);
  const [mode, setMode] = useState<CompareMode>(initialMode === 'side' ? 'side' : 'ghost');
  const [kind, setKind] = useState<'best' | 'last' | null>(null);
  const target = COMPARE_TARGETS[kind ?? (mode === 'ghost' ? 'best' : 'last')];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  return (
    <CompareScreen
      analysis={load.analysis}
      target={target}
      mode={mode}
      onMode={(m) => {
        setMode(m);
        setKind(null);
      }}
      onTarget={() => setKind(target.kind === 'best' ? 'last' : 'best')}
      onBack={back}
    />
  );
}
