import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { COMPARE_TARGETS } from '../../src/analysis/fixtures';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import CompareScreen, { type CompareMode } from '../../src/features/analysis/CompareScreen';
import { useLift } from '../../src/features/library/repository';
import { shortDate } from '../../src/features/library/derive';
import { t } from '../../src/i18n';

// With `best` (the lifter's best lift id) today's lift is overlaid on it. Without it the "Your best" / "Last
// session" targets are fixture variants of the demo snatch, so that stays a dev preview.
export default function CompareRoute() {
  const params = useLocalSearchParams<{ fixture?: string; mode?: CompareMode; best?: string }>();
  if (params.best) return <VsBest key={`${params.fixture ?? ''}-${params.best}`} fixture={params.fixture} best={params.best} />;
  if (!__DEV__) return <Redirect href="/" />;
  return <Compare key={`${params.fixture ?? ''}-${params.mode ?? ''}`} fixture={params.fixture} initialMode={params.mode} />;
}

function VsBest({ fixture, best }: { fixture?: string; best: string }) {
  const router = useRouter();
  const load = useAnalysis(fixture);
  const other = useAnalysis(best);
  const lift = useLift(best);
  const [mode, setMode] = useState<CompareMode>('ghost');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready') return <AnalysisPlaceholder status={load.status} onBack={back} />;
  if (other.status !== 'ready') return <AnalysisPlaceholder status={other.status} onBack={back} />;
  const target = {
    kind: 'best' as const,
    label: t('analysis.compare.yourBest'),
    dateLabel: lift ? shortDate(lift.date) : '',
    analysis: { ...other.analysis, loadKg: lift?.loadKg ?? other.analysis.loadKg },
  };
  return <CompareScreen analysis={load.analysis} target={target} mode={mode} onMode={setMode} onBack={back} />;
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
