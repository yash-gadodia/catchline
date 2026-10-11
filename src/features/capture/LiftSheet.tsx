import { Pressable, Text, View } from 'react-native';
import type { Movement } from '../../analysis/types';
import Sheet from '../../components/Sheet';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { GROUPS, SOON, liftsIn } from '../onboarding/lifts';

export default function LiftSheet({
  value,
  onPick,
  onClose,
}: {
  value: Movement;
  onPick: (m: Movement) => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Pressable
        onPress={onClose}
        testID="lift-sheet-backdrop"
        accessibilityLabel="Close"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.scrim }}
      />
      <Sheet testID="lift-sheet" gap={space.s4}>
        {GROUPS.map((g) => (
          <View key={g.id} style={{ gap: space.s1 }}>
            <SmallCaps size={12}>{g.label}</SmallCaps>
            {liftsIn(g.id).map((l) => {
              const on = l.id === value;
              return (
                <Pressable
                  key={l.id}
                  testID={`pick-${l.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => onPick(l.id)}
                  style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: colors.text, fontFamily: on ? fontFamily.bodyBold : fontFamily.body, fontSize: 17, lineHeight: 24 }}>
                    {l.name}
                  </Text>
                  <Text style={{ color: on ? colors.text : colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
                    {on ? '✓' : l.sub}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>
          {`soon · ${SOON.join(' · ').toLowerCase()}`}
        </Text>
      </Sheet>
    </View>
  );
}
