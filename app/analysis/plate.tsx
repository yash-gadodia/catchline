import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import MarkScreen from '../../src/features/capture/MarkScreen';
import { foundMark } from '../../src/features/capture/plateMark';
import { localClipUri } from '../../src/data/localLifts';
import { retrackLift } from '../../src/data/devicePipeline';
import { timeOf } from '../../src/features/analysis/tracker';
import { colors } from '../../src/design/tokens';

// From the player: the plate the tracker found on this lift, for the lifter to adjust. Tracking again goes through
// the same progress screen as a new lift and lands back on the player.
export default function PlateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const load = useAnalysis(id);
  const clip = id ? localClipUri(id) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (load.status !== 'ready' || !clip) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const analysis = load.analysis;
  const found = foundMark(analysis.reps[0]?.path ?? []);
  const frame = found?.frame ?? 0;
  return (
    <MarkScreen
      uri={clip}
      at={timeOf(frame, analysis.video.fps || 30)}
      initial={found ? { x: found.x, y: found.y, r: found.r } : null}
      onBack={back}
      onTrack={(mark) => {
        if (retrackLift(analysis.id, analysis.movement, { ...mark, frame })) router.replace({ pathname: '/analysis/processing', params: { live: '1' } });
      }}
    />
  );
}
