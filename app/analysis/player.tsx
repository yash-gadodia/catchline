import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import PlayerScreen from '../../src/features/analysis/PlayerScreen';

export default function PlayerRoute() {
  const { fixture, frame } = useLocalSearchParams<{ fixture?: string; frame?: string }>();
  const router = useRouter();
  const analysis = getAnalysis(fixture);
  return (
    <PlayerScreen
      key={`${analysis.id}-${frame ?? ''}`}
      analysis={analysis}
      initialFrame={frame ? Number(frame) : undefined}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onCompare={() => router.push({ pathname: '/analysis/compare', params: { fixture: analysis.id, mode: 'ghost' } })}
      onShare={() => {
        if (analysis.cue) Share.share({ message: analysis.cue.text });
      }}
    />
  );
}
