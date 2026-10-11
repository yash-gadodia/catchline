import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import type { PhaseName, Rep } from '../../analysis/types';
import { phaseLabel, seconds } from '../../analysis/format';
import { phaseSeconds } from '../../analysis/timeline';
import SmallCaps from '../../components/SmallCaps';
import { colors, control, radius, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';

const UNTIMED: PhaseName[] = ['setup', 'recovery'];

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
    if (x != null) scroll.current?.scrollTo({ x: Math.max(0, x - space.gutter), animated: true });
  }, [active]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: space.gutter, paddingVertical: space.s2 }}
    >
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
              if (on) scroll.current?.scrollTo({ x: Math.max(0, x - space.gutter), animated: false });
            }}
            style={{
              height: control.chipHeight,
              paddingHorizontal: 10,
              borderWidth: 1,
              borderColor: on ? colors.text : colors.hairline,
              borderRadius: radius.control,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <SmallCaps size={12} tracking={0.06} color={past && !on ? colors.text3 : colors.text}>
              {phaseLabel(p.name)}
            </SmallCaps>
            {UNTIMED.includes(p.name) ? null : (
              <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>
                {seconds(phaseSeconds(p, fps))}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
