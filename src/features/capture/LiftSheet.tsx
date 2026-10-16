import { Pressable, Text, View } from 'react-native';
import type { Movement } from '../../analysis/types';
import Row from '../../components/Row';
import Sheet from '../../components/Sheet';
import SmallCaps from '../../components/SmallCaps';
import { colors, control, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { groups, liftsIn, soonLifts } from '../onboarding/lifts';
import { t } from '../../i18n';

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
        accessibilityLabel={t('capture.liftSheet.close')}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.scrim }}
      />
      <Sheet testID="lift-sheet" gap={space.s4}>
        {groups().map((g) => (
          <View key={g.id} style={{ gap: space.s1 }}>
            <SmallCaps size={12}>{g.label}</SmallCaps>
            {liftsIn(g.id).map((l) => {
              const on = l.id === value;
              return (
                <Row
                  key={l.id}
                  testID={`pick-${l.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => onPick(l.id)}
                  divider="none"
                  style={{ height: control.compactHeight }}
                >
                  <Text style={{ color: colors.text, ...type.body, fontFamily: on ? fontFamily.bodyBold : fontFamily.body }}>
                    {l.name}
                  </Text>
                  <Text style={{ color: on ? colors.text : colors.text3, ...type.readout }}>
                    {on ? '✓' : l.sub}
                  </Text>
                </Row>
              );
            })}
          </View>
        ))}
        <Text style={{ color: colors.text3, ...type.caption }}>
          {t('capture.liftSheet.soon', { lifts: soonLifts().join(' · ').toLowerCase() })}
        </Text>
      </Sheet>
    </View>
  );
}
