import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis } from '../../analysis/types';
import { fmt, movementLabel } from '../../analysis/format';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import PlayerScreen from '../analysis/PlayerScreen';
import { t } from '../../i18n';

export function coachMarks(): string[] {
  return [t('onboarding.sample.coach1'), t('onboarding.sample.coach2')];
}

const COACH_MARK_COUNT = 2;

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
  const title = [t('onboarding.sample.label'), movementLabel(sample.movement).toLowerCase(), sample.loadKg != null ? `${fmt(sample.loadKg)} kg` : null]
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
          <Text style={{ color: colors.text, ...type.label }}>{t('onboarding.sample.back')}</Text>
        </Pressable>
        <SmallCaps>{title}</SmallCaps>
      </View>
      {mark < COACH_MARK_COUNT ? (
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
          {t('onboarding.sample.film')}
        </Btn>
      </View>
    </View>
  );
}

function CoachMark({ index, top, onNext }: { index: number; top: number; onNext: () => void }) {
  const last = index === COACH_MARK_COUNT - 1;
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
        ...shape.control,
        gap: space.s2,
      }}
    >
      <Text style={{ color: colors.text, ...type.callout }}>{coachMarks()[index]}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text2, ...type.caption }}>
          {`${index + 1} / ${COACH_MARK_COUNT}`}
        </Text>
        <Text style={{ color: colors.text, ...type.label, textDecorationLine: 'underline' }}>
          {last ? t('onboarding.sample.gotIt') : t('onboarding.sample.next')}
        </Text>
      </View>
    </Pressable>
  );
}
