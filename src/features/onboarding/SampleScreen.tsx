import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis } from '../../analysis/types';
import { fmt, movementLabel } from '../../analysis/format';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, radius, space, stroke } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import PlayerScreen from '../analysis/PlayerScreen';

export const COACH_MARKS = [
  'The red line is where the bar went. Tap the video to play it slowly.',
  'Tap a phase to jump straight to it. The numbers are how long each one took.',
];

const TOP_BAR = 56;
const CHIPS = 56;

// The real player on the sample lift, with its chrome swapped: a "Sample"
// header over the top bar and one CTA over Compare/Share.
export default function SampleScreen({
  sample,
  onBack,
  onFilm,
}: {
  sample: Analysis;
  onBack: () => void;
  onFilm: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mark, setMark] = useState(0);
  const stageBottom = insets.top + TOP_BAR + Math.round(width * 1.25);
  const title = ['Sample', movementLabel(sample.movement).toLowerCase(), sample.loadKg != null ? `${fmt(sample.loadKg)} kg` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="sample-screen">
      <PlayerScreen analysis={sample} onBack={onBack} onCompare={() => {}} onShare={() => {}} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: insets.top + TOP_BAR,
          paddingTop: insets.top,
          paddingHorizontal: space.gutter,
          backgroundColor: colors.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" testID="sample-back">
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>‹ Back</Text>
        </Pressable>
        <SmallCaps>{title}</SmallCaps>
      </View>
      {mark < COACH_MARKS.length ? (
        <CoachMark
          index={mark}
          top={mark === 0 ? stageBottom - 168 : stageBottom + CHIPS + space.s2}
          onNext={() => setMark((m) => m + 1)}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: space.s2,
          paddingHorizontal: space.gutter,
          paddingBottom: Math.max(insets.bottom, space.s4),
          backgroundColor: colors.bg,
        }}
      >
        <Btn onPress={onFilm} testID="sample-film">
          Now film yours
        </Btn>
      </View>
    </View>
  );
}

function CoachMark({ index, top, onNext }: { index: number; top: number; onNext: () => void }) {
  const last = index === COACH_MARKS.length - 1;
  return (
    <Pressable
      onPress={onNext}
      testID={`coach-mark-${index + 1}`}
      accessibilityRole="button"
      style={{
        position: 'absolute',
        left: space.gutter,
        right: space.gutter,
        top,
        padding: space.s4,
        backgroundColor: colors.surface,
        borderWidth: stroke.hairline,
        borderColor: colors.text,
        borderRadius: radius.control,
        gap: space.s2,
      }}
    >
      <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>{COACH_MARKS[index]}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>
          {`${index + 1} / ${COACH_MARKS.length}`}
        </Text>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20, textDecorationLine: 'underline' }}>
          {last ? 'Got it' : 'Next'}
        </Text>
      </View>
    </Pressable>
  );
}
