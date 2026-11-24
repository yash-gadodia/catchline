import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import Text from '../../components/Text';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { t } from '../../i18n';
import { timeOf } from '../analysis/tracker';
import { fitBox, SAMPLE_ANALYSIS, SAMPLE_CLIP } from './sample';

// The two steps before the sample lift's tracked result, each one tap: the video as the lifter would pick it (and
// that it stays on the phone), then the plate found on its first frame. `onTrack` goes on to the result, where the
// path draws itself. About 15 seconds with the result: the app shown by doing it once.
export default function SampleTour({ onTrack, reduceMotion }: { onTrack: () => void; reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const systemReduce = useReducedMotion();
  const reduce = reduceMotion ?? systemReduce;
  const [step, setStep] = useState<1 | 2>(1);
  const analysis = SAMPLE_ANALYSIS;
  const start = analysis.reps[0]?.path[0];
  const player = useVideoPlayer(SAMPLE_CLIP, (p) => {
    p.muted = true;
    p.loop = true;
    // with Reduce Motion the first step is one still of the lift
    if (!reduce) p.play();
  });
  const box = { width, height: Math.max(height - 300, 240) };
  const video = fitBox(analysis.video, box);
  // the plate's circle: its radius is a share of the video's height
  const size = (start?.r ?? 0) * video.height * 2;
  const ring = start && size ? { left: start.x * video.width - size / 2, top: start.y * video.height - size / 2 } : null;
  const next = () => {
    if (step === 2) return onTrack();
    player.pause();
    player.currentTime = timeOf(start?.frame ?? 0, analysis.video.fps);
    setStep(2);
  };
  return (
    <View testID="sample-tour" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, overflow: 'hidden' }} pointerEvents="none">
        <View style={{ position: 'absolute', left: video.left, top: video.top, width: video.width, height: video.height }}>
          <VideoView player={player} style={{ width: video.width, height: video.height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
          {step === 2 && ring ? (
            <View
              testID="tour-plate"
              style={{ position: 'absolute', left: ring.left, top: ring.top, width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors.flare }}
            />
          ) : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s4 }}>
        <View style={{ gap: space.s2 }}>
          <Text style={{ color: colors.text2, ...type.small }}>{t('onboarding.tour.step', { n: step })}</Text>
          <Text style={[display(36), { color: colors.text }]}>{t(step === 1 ? 'onboarding.tour.video.title' : 'onboarding.tour.plate.title')}</Text>
          <Text style={{ color: colors.text, ...type.body }}>{t(step === 1 ? 'onboarding.tour.video.body' : 'onboarding.tour.plate.body')}</Text>
        </View>
        <Btn onPress={next} testID="tour-next">
          {t(step === 1 ? 'onboarding.tour.next' : 'onboarding.tour.track')}
        </Btn>
      </View>
    </View>
  );
}
