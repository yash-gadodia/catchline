import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import SmallCaps from '../../components/SmallCaps';
import { colors, opacity, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { drillFor } from './drills';
import { drillVisible, useDrillsFlag } from './flag';

// "Try this drill" under the headline cue: name and dose, tap for the steps and why.
// Nothing when the fault has no drill, or the drill is a draft and the gate is closed.
export default function DrillCard({ faultId }: { faultId?: string }) {
  const flag = useDrillsFlag();
  const [open, setOpen] = useState(false);
  const drill = drillFor(faultId);
  if (!drill || !drillVisible(drill, flag)) return null;
  return (
    <Pressable
      testID="drill-card"
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides the steps' : 'Shows the steps'}
      style={({ pressed }) => ({
        borderTopWidth: stroke.hairline,
        borderTopColor: colors.hairline,
        paddingTop: space.s3,
        gap: space.s1,
        opacity: pressed ? opacity.pressed : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SmallCaps>Try this drill</SmallCaps>
        <Text style={{ ...type.caption, color: colors.text2 }}>{open ? 'Hide' : 'Steps'}</Text>
      </View>
      <Text testID="drill-name" style={{ ...type.label, color: colors.text }}>
        {drill.name}
      </Text>
      <Text testID="drill-dose" style={{ ...type.small, color: colors.text2 }}>
        {drill.dose}
      </Text>
      {open ? (
        <View testID="drill-detail" style={{ gap: space.s2, paddingTop: space.s2 }}>
          {drill.steps.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: space.s2 }}>
              <Text style={{ ...type.caption, color: colors.text2 }}>{i + 1}</Text>
              <Text style={{ ...type.small, color: colors.text, flex: 1 }}>{s}</Text>
            </View>
          ))}
          <Text testID="drill-why" style={{ ...type.small, color: colors.text2 }}>
            {drill.why}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
