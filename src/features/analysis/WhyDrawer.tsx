import { Pressable, Text, View } from 'react-native';
import type { Analysis } from '../../analysis/types';
import { measurementLabel, measurementReadout } from '../../analysis/format';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { t } from '../../i18n';

export default function WhyDrawer({ analysis, onClose }: { analysis: Analysis; onClose: () => void }) {
  const rows = analysis.measurements;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} testID="why-drawer">
      <Pressable
        onPress={onClose}
        accessibilityLabel={t('analysis.why.close')}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)' }}
      />
      <Sheet gap={16}>
        <Text style={{ color: colors.text, ...type.title }}>
          {t('analysis.why.title')}
        </Text>
        <Text style={{ color: colors.text2, ...type.callout }}>
          {t('analysis.why.body')}
        </Text>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {rows.map((m, i) => {
            const isCue = m.status === 'cue';
            const readout = measurementReadout(m);
            const value = readout.split(' · ')[0];
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
                <Text style={{ color: colors.text, ...type.body }}>
                  {measurementLabel(m)}
                </Text>
                <Text
                  style={{
                    flexShrink: 1,
                    maxWidth: '55%',
                    textAlign: 'right',
                    color: colors.text2,
                    ...type.readout,
                  }}
                >
                  {isCue ? (
                    <>
                      {/* design-ok: a larger value run nested in a type.readout line; the parent sets the line */}
                      <Text style={{ color: colors.flare, fontFamily: fontFamily.monoMedium, fontSize: 15 }}>{value}</Text>
                      {readout.slice(value.length)}
                    </>
                  ) : (
                    readout
                  )}
                </Text>
              </View>
            );
          })}
        </View>
        <Btn kind="secondary" onPress={onClose} testID="why-close">
          {t('analysis.why.close')}
        </Btn>
      </Sheet>
    </View>
  );
}
