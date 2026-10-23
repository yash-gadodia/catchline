import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import ClipPlayer, { useClipThumbs } from './ClipPlayer';
import { Header, Underlined } from './hud';
import { activeTrim, type Clip } from './store';
import Trimmer from './Trimmer';
import { clampToTrim, trimProblem, type Trim } from './trim';
import { maxDurationS } from './compress';
import { t } from '../../i18n';

export default function TrimScreen({
  clip,
  onCancel,
  onDone,
}: {
  clip: Clip;
  onCancel: () => void;
  onDone: (trim: Trim) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [trim, setTrim] = useState<Trim>(activeTrim(clip));
  const [drag, setDrag] = useState<number | undefined>(undefined);
  const [head, setHead] = useState(trim.start);
  const [playing, setPlaying] = useState(true);
  const thumbs = useClipThumbs(clip.uri, clip.durationS);
  const problem = trimProblem(trim);
  const reps = clip.repsFound ? t('capture.trim.reps', { count: clip.repsFound }) : '';

  return (
    <View testID="trim-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onCancel} testID="trim-cancel">{t('capture.trim.cancel')}</Underlined>}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('capture.trim.title')}</Text>}
        right={
          problem === 'too_long' ? null : (
            <Underlined onPress={() => onDone(trim)} testID="trim-done">{t('capture.trim.done')}</Underlined>
          )
        }
      />
      <Pressable
        onPress={() => setPlaying((p) => !p)}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('capture.trim.pause') : t('capture.trim.play')}
        testID="trim-preview"
      >
        <ClipPlayer
          uri={clip.uri}
          trim={trim}
          durationS={clip.durationS}
          width={width}
          height={Math.min(Math.round(width * 1.08), 420)}
          seekTo={drag ?? (playing ? undefined : head)}
          onTime={setHead}
          progress={false}
        />
      </Pressable>
      <View style={{ padding: space.gutter }}>
        <Trimmer
          durationS={clip.durationS}
          trim={trim}
          thumbs={thumbs}
          label={reps}
          head={head}
          onChange={(next) => {
            setTrim(next);
            setHead((h) => clampToTrim(h, next));
          }}
          onHead={(at) => {
            setPlaying(false);
            setHead(at);
          }}
          onDrag={(handle, at) => setDrag(handle ? at : undefined)}
        />
        {problem ? (
          <Text testID="trim-problem" style={{ color: problem === 'too_long' ? colors.flare : colors.text2, ...type.callout, paddingTop: space.s3 }}>
            {problem === 'too_long' ? t('capture.trim.tooLong', { max: maxDurationS() }) : t('capture.trim.long')}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      <Text
        style={{
          color: colors.text2,
          ...type.callout,
          paddingHorizontal: space.gutter,
          paddingBottom: Math.max(insets.bottom, space.s4) + space.s5,
        }}
      >
        {t('capture.trim.help')}
      </Text>
    </View>
  );
}
