import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import ClipPlayer, { useClipThumbs } from './ClipPlayer';
import type { Units } from '../onboarding/store';
import { Header, Underlined, WeightField } from './hud';
import type { Clip } from './store';
import Trimmer from './Trimmer';
import { clampToTrim, trimProblem, type Trim } from './trim';
import { maxDurationS } from './compress';
import { t } from '../../i18n';

export default function TrimScreen({
  clip,
  units,
  weight,
  onWeight,
  onCancel,
  onTrack,
}: {
  clip: Clip;
  units: Units;
  weight: string;
  onWeight: (w: string) => void;
  onCancel: () => void;
  onTrack: (trim: Trim) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [trim, setTrim] = useState<Trim>(clip.trim);
  const [drag, setDrag] = useState<number | undefined>(undefined);
  const [head, setHead] = useState(trim.start);
  const [playing, setPlaying] = useState(true);
  const thumbs = useClipThumbs(clip.uri, clip.durationS);
  const problem = trimProblem(trim);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="trim-screen"
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      <Header
        left={<Underlined onPress={onCancel} testID="trim-cancel">{t('capture.trim.cancel')}</Underlined>}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('capture.trim.title')}</Text>}
        right={<WeightField value={weight} units={units} onChange={onWeight} />}
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
      <Text style={{ color: colors.text2, ...type.callout, paddingHorizontal: space.gutter }}>{t('capture.trim.help')}</Text>
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2 }}>
        <Btn onPress={() => onTrack(trim)} disabled={problem === 'too_long'} testID="trim-track">
          {t('capture.trim.track')}
        </Btn>
      </View>
    </KeyboardAvoidingView>
  );
}
