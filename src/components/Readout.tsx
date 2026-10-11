import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../design/tokens';
import { fontFamily } from '../design/typography';

export default function Readout({
  children,
  size = 13,
  color = colors.text,
  style,
  testID,
}: {
  children: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[{ backgroundColor: colors.scrim, paddingVertical: 4, paddingHorizontal: 8 }, style]}>
      <Text
        testID={testID}
        numberOfLines={1}
        style={{ color, fontFamily: fontFamily.mono, fontSize: size, lineHeight: Math.round(size * 1.4) }}
      >
        {children}
      </Text>
    </View>
  );
}
