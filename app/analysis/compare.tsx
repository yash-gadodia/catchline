import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COMPARE_TARGETS, getAnalysis } from '../../src/analysis/fixtures';
import CompareScreen, { type CompareMode } from '../../src/features/analysis/CompareScreen';

export default function CompareRoute() {
  const params = useLocalSearchParams<{ fixture?: string; mode?: CompareMode }>();
  return <Compare key={`${params.fixture ?? ''}-${params.mode ?? ''}`} fixture={params.fixture} initialMode={params.mode} />;
}

function Compare({ fixture, initialMode }: { fixture?: string; initialMode?: CompareMode }) {
  const router = useRouter();
  const analysis = getAnalysis(fixture);
  const [mode, setMode] = useState<CompareMode>(initialMode === 'side' ? 'side' : 'ghost');
  const [kind, setKind] = useState<'best' | 'last' | null>(null);
  const target = COMPARE_TARGETS[kind ?? (mode === 'ghost' ? 'best' : 'last')];
  return (
    <CompareScreen
      analysis={analysis}
      target={target}
      mode={mode}
      onMode={(m) => {
        setMode(m);
        setKind(null);
      }}
      onTarget={() => setKind(target.kind === 'best' ? 'last' : 'best')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
