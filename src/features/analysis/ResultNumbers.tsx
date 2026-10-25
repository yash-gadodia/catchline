import { Text, View } from 'react-native';
import type { Analysis } from '../../analysis/types';
import { fmt, measurementLabel, speedRows, valueText } from '../../analysis/format';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { isKey, t } from '../../i18n';

// The key numbers the analysis marked confident, then the bar speed rows; nothing that was not measured with confidence.
export function resultNumbers(a: Analysis): { id: string; label: string; value: string }[] {
  const key = (a.keyNumbers ?? []).flatMap((id) => {
    const m = a.measurements.find((x) => x.id === id && x.status !== 'not_seen');
    const label = `analysis.key.${id}`;
    if (!m || !isKey(label)) return [];
    const value = id === 'jump_forward' ? t(m.value < 0 ? 'analysis.key.feetBack' : 'analysis.key.feetForward', { cm: fmt(Math.abs(m.value)) }) : valueText(m);
    return [{ id, label: t(label), value }];
  });
  return [...key, ...speedRows(a).map((m) => ({ id: m.id, label: measurementLabel(m), value: valueText(m) }))];
}

// The lift's key numbers under the path, two to a row.
export default function ResultNumbers({ analysis }: { analysis: Analysis }) {
  const rows = resultNumbers(analysis);
  if (rows.length === 0) return null;
  return (
    <View
      testID="result-numbers"
      style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s3, paddingVertical: space.s3, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline }}
    >
      {rows.map((r) => (
        <View key={r.id} testID={`result-number-${r.id}`} style={{ width: '50%', gap: space.s1 }}>
          <SmallCaps size={11}>{r.label}</SmallCaps>
          <Text style={{ color: colors.text, ...type.readout }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}
