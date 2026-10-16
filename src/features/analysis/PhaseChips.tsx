import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import FadeRow from './FadeRow';
import type { PhaseName, Rep } from '../../analysis/types';
import { phaseLabel, seconds } from '../../analysis/format';
import { phaseSeconds } from '../../analysis/timeline';
import SmallCaps from '../../components/SmallCaps';
import { colors, control, radius, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { t, type Key } from '../../i18n';

const UNTIMED: PhaseName[] = ['setup', 'recovery'];

// Short enough that the active chip and its neighbours fit on a phone.
const CHIP: Partial<Record<PhaseName, Key>> = { transition: 'analysis.chip.transition', turnover: 'analysis.chip.turnover', recovery: 'analysis.chip.recovery' };

export function chipLabel(p: PhaseName): string {
  const key = CHIP[p];
  return key ? t(key) : phaseLabel(p);
}

export default function PhaseChips({
  rep,
  fps,
  active,
  onPick,
}: {
  rep: Rep;
  fps: number;
  active: PhaseName | null;
  onPick: (name: PhaseName) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const xs = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!active) return;
    const x = xs.current[active];
    if (x != null) scroll.current?.scrollTo({ x: Math.max(0, x - space.gutter * 2), animated: true });
  }, [active]);
  return (
    <FadeRow ref={scroll} testID="phase-chips" contentContainerStyle={{ gap: 6, paddingHorizontal: space.gutter, paddingVertical: space.s2 }}>
      {rep.phases.map((p) => {
        const on = p.name === active;
        const past = active ? rep.phases.findIndex((q) => q.name === active) > rep.phases.indexOf(p) : false;
        return (
          <Pressable
            key={p.name}
            testID={`chip-${p.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(p.name)}
            onLayout={(e) => {
              const x = e.nativeEvent.layout.x;
              xs.current[p.name] = x;
              if (on) scroll.current?.scrollTo({ x: Math.max(0, x - space.gutter * 2), animated: false });
            }}
            style={{
              height: control.chipHeight,
              paddingHorizontal: 8,
              borderWidth: 1,
              borderColor: on ? colors.text : colors.hairline,
              borderRadius: radius.control,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SmallCaps size={12} tracking={0.06} color={past && !on ? colors.text2 : colors.text}>
              {chipLabel(p.name)}
            </SmallCaps>
            {UNTIMED.includes(p.name) ? null : (
              <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>
                {seconds(phaseSeconds(p, fps))}
              </Text>
            )}
          </Pressable>
        );
      })}
    </FadeRow>
  );
}
