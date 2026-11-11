import { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { timeOf } from '../analysis/tracker';
import { Header, Underlined } from '../capture/hud';
import PlateStage from '../capture/PlateStage';
import { containRect, type PlateMark } from '../capture/plateMark';
import { t } from '../../i18n';
import { plateFramesGranted } from './consent';
import { addLocalCorrection } from './local';
import { sendCorrection } from './send';

// "The path is wrong": the lifter draws the circle on the plate on the frame they were looking at. The correction is
// kept with the lift on the phone; a crop of that frame goes out as a strong label only if they opted in.
export default function CorrectScreen({
  liftId,
  clipUri,
  frame,
  video,
  onDone,
}: {
  liftId: string;
  clipUri: string;
  frame: number;
  video: { width: number; height: number; fps: number; frameCount: number };
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.round(height * 0.58) };
  const rect = video.width > 0 && video.height > 0 ? containRect(video, box) : null;
  const [mark, setMark] = useState<PlateMark | null>(null);
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(clipUri, (p) => {
    p.muted = true;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.currentTime = timeOf(frame, video.fps);
    p.pause();
  });
  // Frames are spread over the clip's real length, as on the tracker, so this is the picture the lifter was on.
  useEffect(() => {
    const loaded = player.addListener('sourceLoad', (e) => {
      if (e.duration > 0) player.currentTime = timeOf(frame, Math.max(video.frameCount, 1) / e.duration);
    });
    return () => loaded.remove();
  }, [player, frame, video.frameCount]);

  const save = async () => {
    if (!mark || saving) return;
    setSaving(true);
    await addLocalCorrection(liftId, frame, mark);
    void sendCorrection(liftId, frame, mark);
    onDone();
  };

  return (
    <View testID="correct-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onDone} testID="correct-back">{t('analysis.correct.back')}</Underlined>}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('analysis.correct.title')}</Text>}
        right={<View />}
      />
      <PlateStage box={box} rect={rect} mark={mark} onMark={setMark} testID="correct-stage" accessibilityLabel={t('analysis.correct.stage')}>
        <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="contain" nativeControls={false} allowsVideoFrameAnalysis={false} />
      </PlateStage>
      <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: Math.max(insets.bottom, space.s4), justifyContent: 'space-between' }}>
        <View style={{ gap: space.s2 }}>
          <Text testID="correct-help" style={{ ...type.callout, color: colors.text2 }}>
            {mark ? t('analysis.correct.redo') : t('analysis.correct.help')}
          </Text>
          <Text testID="correct-where" style={{ ...type.small, color: colors.text3 }}>
            {plateFramesGranted() ? t('analysis.correct.sent') : t('analysis.correct.local')}
          </Text>
        </View>
        <Btn onPress={() => void save()} disabled={!mark || saving} testID="correct-save">
          {t('analysis.correct.save')}
        </Btn>
      </View>
    </View>
  );
}
