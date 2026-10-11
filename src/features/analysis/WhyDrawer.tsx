import { Pressable, Text, View } from 'react-native';
import type { Analysis } from '../../analysis/types';
import { measurementReadout } from '../../analysis/format';
import Sheet from '../../components/Sheet';
import { colors } from '../../design/tokens';
import { fontFamily } from '../../design/typography';

export default function WhyDrawer({ analysis, onClose }: { analysis: Analysis; onClose: () => void }) {
  const rows = analysis.measurements;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} testID="why-drawer">
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)' }}
      />
      <Sheet gap={16}>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
          Why this and not something else?
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
          We pick the earliest fault that explains the rest. Everything else we measured:
        </Text>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {rows.map((m, i) => {
            const isCue = m.status === 'cue';
            return (
              <View
                key={m.id}
                testID={`why-row-${m.id}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                  borderBottomColor: colors.hairline,
                }}
              >
                <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
                  {m.label}
                </Text>
                <Text
                  style={{
                    flexShrink: 1,
                    textAlign: 'right',
                    color: isCue ? colors.flare : colors.text2,
                    fontFamily: fontFamily.mono,
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  {measurementReadout(m)}
                </Text>
              </View>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
