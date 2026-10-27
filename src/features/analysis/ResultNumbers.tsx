import { Text, View } from 'react-native';
import type { Analysis, Measurement } from '../../analysis/types';
import { fmt, measurementLabel, speedRows, valueText } from '../../analysis/format';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { isKey, t } from '../../i18n';

function keyValue(id: string, m: Measurement): string {
  if (id === 'jump_forward') return t(m.value < 0 ? 'analysis.key.feetBack' : 'analysis.key.feetForward', { cm: fmt(Math.abs(m.value)) });
  if (id === 'bar_over_shoulder') return t(m.value < 0 ? 'analysis.key.barBehind' : 'analysis.key.barFront', { cm: fmt(Math.abs(m.value)) });
  if (m.unit === 'deg') return `${fmt(Math.round(m.value))}°`;
  return valueText(m);
}

// The key numbers the analysis marked confident, then the bar speed rows; nothing that was not measured with confidence.
export function resultNumbers(a: Analysis): { id: string; label: string; value: string }[] {
  const key = (a.keyNumbers ?? []).flatMap((id) => {
    const m = a.measurements.find((x) => x.id === id && x.status !== 'not_seen');
    const label = `analysis.key.${id}`;
    if (!m || !isKey(label)) return [];
    return [{ id, label: t(label), value: keyValue(id, m) }];
  });
  return [...key, ...speedRows(a).map((m) => ({ id: m.id, label: measurementLabel(m), value: valueText(m) }))];
}

// Why the forward/back numbers are missing: filmed past 45 deg off side-on (the yaw bucket says so; the exact angle
// when the result carries it).
export function offSideNote(a: Analysis): string | null {
  if (a.yawBucket !== '45-60' && a.yawBucket !== 'past_60') return null;
  const deg = a.noCueReason?.offSideDeg;
  return deg == null ? t('analysis.key.offSideHiddenNoDeg') : t('analysis.key.offSideHidden', { deg: Math.round(deg) });
}

// The lift's key numbers under the path, two to a row.
export default function ResultNumbers({ analysis }: { analysis: Analysis }) {
  const rows = resultNumbers(analysis);
  const note = offSideNote(analysis);
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
      {note ? (
        <Text testID="off-side-note" style={{ width: '100%', color: colors.text2, ...type.caption }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
