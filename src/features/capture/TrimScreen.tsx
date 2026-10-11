import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import ClipPlayer, { clipThumbs } from './ClipPlayer';
import { Header, Underlined } from './hud';
import { activeTrim, type Clip } from './store';
import Trimmer from './Trimmer';
import type { Trim } from './trim';

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
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const reps = clip.repsFound ? `${clip.repsFound} rep${clip.repsFound === 1 ? '' : 's'}` : '';

  return (
    <View testID="trim-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onCancel} testID="trim-cancel">Cancel</Underlined>}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Adjust trim</Text>}
        right={<Underlined onPress={() => onDone(trim)} testID="trim-done">Done</Underlined>}
      />
      <ClipPlayer
        uri={clip.uri}
        trim={trim}
        durationS={clip.durationS}
        width={width}
        height={Math.min(Math.round(width * 1.08), 420)}
        seekTo={seek}
        progress={false}
      />
      <View style={{ padding: space.gutter }}>
        <Trimmer
          durationS={clip.durationS}
          trim={trim}
          thumbs={clipThumbs(clip.uri)}
          label={reps}
          onChange={setTrim}
          onDrag={(handle, t) => setSeek(handle ? t : undefined)}
        />
      </View>
      <View style={{ flex: 1 }} />
      <Text
        style={{
          color: colors.text2,
          fontFamily: fontFamily.body,
          fontSize: 15,
          lineHeight: 21,
          paddingHorizontal: space.gutter,
          paddingBottom: Math.max(insets.bottom, space.s4) + space.s5,
        }}
      >
        Keep a second before the first rep and after the last. We'll find the reps inside.
      </Text>
    </View>
  );
}
