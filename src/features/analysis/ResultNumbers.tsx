import { Text, View } from 'react-native';
import type { Measurement } from '../../analysis/types';
import { measurementLabel, valueText } from '../../analysis/format';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';

// The lift's key numbers under the path, two to a row; only measurements that were confidently measured are passed in.
export default function ResultNumbers({ rows }: { rows: Measurement[] }) {
  if (rows.length === 0) return null;
  return (
    <View
      testID="result-numbers"
      style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s3, paddingVertical: space.s3, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline }}
    >
      {rows.map((m) => (
        <View key={m.id} testID={`result-number-${m.id}`} style={{ width: '50%', gap: 2 }}>
          <SmallCaps size={11}>{measurementLabel(m)}</SmallCaps>
          <Text style={{ color: colors.text, ...type.readout }}>{valueText(m)}</Text>
        </View>
      ))}
    </View>
  );
}
