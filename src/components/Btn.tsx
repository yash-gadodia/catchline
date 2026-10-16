import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, control, shape, stroke } from '../design/tokens';
import { fontFamily } from '../design/typography';

type Props = {
  children: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'text';
  compact?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Btn({ children, onPress, kind = 'primary', compact, testID, style }: Props) {
  const size = compact ? 15 : 17;
  if (kind === 'text') {
    return (
      <Pressable onPress={onPress} testID={testID} hitSlop={8} style={style} accessibilityRole="button">
        <Text
          style={{
            color: colors.text,
            fontFamily: fontFamily.bodyMedium,
            fontSize: 15,
            lineHeight: 22,
            textDecorationLine: 'underline',
          }}
        >
          {children}
        </Text>
      </Pressable>
    );
  }
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          height: compact ? control.compactHeight : control.height,
          ...shape.control,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? colors.flare : pressed ? colors.surface2 : 'transparent',
          borderWidth: primary ? 0 : stroke.outline,
          borderColor: colors.text,
          opacity: primary && pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: primary ? colors.onFlare : colors.text,
          fontFamily: fontFamily.bodyBold,
          fontSize: size,
          lineHeight: Math.round(size * 1.3),
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
