import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from '../../components/Text';
import { colors, control, shape, space, stroke } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { formatLoad } from '../../analysis/format';
import { t } from '../../i18n';
import { barSpeed } from '../analysis/speed';
import { useOnboarding } from '../onboarding/store';
import type { LearnLift } from './lifts';

// The Learn tab: world-class lifts, each tracked the way the lifter's own are. A row opens the lift in the player.
// The chips narrow the list to one kind of lift; they show once both kinds are in it.
export default function LearnScreen({ lifts, onOpen }: { lifts: LearnLift[]; onOpen: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const units = useOnboarding((s) => s.units);
  const [only, setOnly] = useState<LearnLift['kind'] | null>(null);
  const kinds = (['snatch', 'cleanJerk', 'clean'] as const).filter((k) => lifts.some((l) => l.kind === k));
  const kindName = (k: LearnLift['kind']) => t(`library.kind.${k}`);
  const shown = only ? lifts.filter((l) => l.kind === only) : lifts;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter, paddingBottom: space.s6, gap: space.s5 }}
      testID="learn-screen"
    >
      <View style={{ gap: space.s2 }}>
        <Text style={[display(36), { color: colors.text }]}>{t('library.learn.title')}</Text>
        <Text style={{ color: colors.text2, ...type.callout }}>{t('library.learn.body')}</Text>
      </View>
      {kinds.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }} testID="learn-kinds">
          {[null, ...kinds].map((k) => (
            <Pressable
              key={k ?? 'all'}
              testID={`learn-kind-${k ?? 'all'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: only === k }}
              onPress={() => setOnly(k)}
              style={{ minHeight: control.chipHeight, paddingHorizontal: space.s3, paddingVertical: space.s1, justifyContent: 'center', borderWidth: stroke.hairline, borderColor: only === k ? colors.text : colors.hairline, ...shape.control }}
            >
              <Text style={{ ...type.caption, color: only === k ? colors.text : colors.text2 }}>{k ? kindName(k) : t('library.lifts.allKinds')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View>
        {shown.map((lift) => {
          const peak = barSpeed(lift.analysis.reps[0]?.path ?? [], lift.analysis.video.fps || 30, lift.analysis.lift)?.peak ?? null;
          const what = [kindName(lift.kind), lift.loadKg === undefined ? null : formatLoad(lift.loadKg, units), lift.where ?? null].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={lift.id}
              onPress={() => onOpen(lift.id)}
              accessibilityRole="button"
              testID={`learn-${lift.id}`}
              style={({ pressed }) => ({ paddingVertical: space.s4, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: space.s1, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s3 }}>
                <Text style={{ flex: 1, color: colors.text, ...type.body, fontFamily: fontFamily.bodyBold }}>{lift.lifter}</Text>
                {peak ? <Text style={{ color: colors.text, ...type.callout, fontFamily: fontFamily.monoMedium }}>{`${peak.v.toFixed(2)} m/s`}</Text> : null}
              </View>
              <Text style={{ color: colors.text2, ...type.callout }}>{what}</Text>
              <Text style={{ color: colors.text3, ...type.small }}>{t('library.learn.credit', { owner: lift.credit })}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
