import { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { Header, Underlined } from './hud';
import { containRect, type PlateMark } from './plateMark';
import PlateStage from './PlateStage';
import type { Clip } from './store';
import { t } from '../../i18n';

// One step before tracking (owner, 11-11): the lifter marks the plate nearest the camera on the first frame of the
// trimmed clip, so the tracker starts on the right plate at the right size. Skipping leaves it to find the plate.
export default function MarkScreen({ clip, onBack, onTrack }: { clip: Clip & { uri: string }; onBack: () => void; onTrack: (mark: PlateMark | null) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.round(height * 0.58) };
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [mark, setMark] = useState<PlateMark | null>(null);
  const rect = frame ? containRect(frame, box) : null;

  const player = useVideoPlayer(clip.uri, (p) => {
    p.muted = true;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.currentTime = clip.trim.start;
    p.pause();
  });
  // The frame's real shape (upright, as shown) comes from a thumbnail; the player answers with none until its item
  // has loaded, so it is asked again until it does, with the video track's own size as a stand-in meanwhile.
  useEffect(() => {
    let live = true;
    let tries = 0;
    const ask = () => {
      tries += 1;
      const track = player.videoTrack?.size ?? player.availableVideoTracks[0]?.size;
      if (track && track.width > 0 && track.height > 0) setFrame((f) => f ?? { width: track.width, height: track.height });
      player.generateThumbnailsAsync([clip.trim.start], { maxWidth: 64 }).then(
        (thumbs) => {
          if (!live) return;
          if (thumbs[0] && thumbs[0].width > 0) {
            setFrame({ width: thumbs[0].width, height: thumbs[0].height });
            clearInterval(timer);
          }
        },
        () => undefined,
      );
      if (tries >= 12) clearInterval(timer);
    };
    const timer = setInterval(ask, 500);
    ask();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [player, clip.trim.start]);

  return (
    <View testID="mark-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onBack} testID="mark-back">{t('capture.mark.back')}</Underlined>}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('capture.mark.title')}</Text>}
        right={<View />}
      />
      <PlateStage box={box} rect={rect} mark={mark} onMark={setMark} testID="mark-stage" accessibilityLabel={t('capture.mark.stage')}>
        <VideoView player={player} style={{ width: box.width, height: box.height }} contentFit="contain" nativeControls={false} allowsVideoFrameAnalysis={false} />
      </PlateStage>
      <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: Math.max(insets.bottom, space.s4), justifyContent: 'space-between' }}>
        <Text testID="mark-help" style={{ ...type.callout, color: colors.text2 }}>
          {mark ? t('capture.mark.redo') : t('capture.mark.help')}
        </Text>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={() => onTrack(mark)} disabled={!mark} testID="mark-track">
            {t('capture.mark.track')}
          </Btn>
          <Btn kind="secondary" compact onPress={() => onTrack(null)} testID="mark-skip">
            {t('capture.mark.skip')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
