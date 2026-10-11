import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import RevealScreen from '../../src/features/analysis/RevealScreen';

export default function Reveal() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const analysis = getAnalysis(fixture);
  return (
    <RevealScreen
      analysis={analysis}
      onDone={() => router.replace({ pathname: '/analysis/cue', params: { fixture: analysis.id } })}
    />
  );
}
