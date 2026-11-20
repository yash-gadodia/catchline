import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Text from './Text';
import { colors, control, shape, space, stroke } from '../design/tokens';
import { fontFamily } from '../design/typography';

type Props = {
  children?: ReactNode;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'destructive' | 'text';
  compact?: boolean;
  square?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Btn({
  children,
  onPress,
  kind = 'primary',
  compact,
  square,
  disabled,
  testID,
  accessibilityLabel,
  style,
}: Props) {
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
  const destructive = kind === 'destructive';
  const height = compact ? control.compactHeight : control.height;
  const label = disabled ? colors.text3 : primary ? colors.onFlare : destructive ? colors.flare : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        {
          // a minimum, not a height: a long label (German, French, large text) wraps inside the button
          minHeight: height,
          width: square ? height : undefined,
          paddingHorizontal: square ? 0 : space.s4,
          paddingVertical: square ? 0 : space.s2,
          ...shape.control,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled
            ? colors.surface2
            : primary
              ? colors.flare
              : pressed
                ? colors.surface2
                : 'transparent',
          borderWidth: primary || disabled ? 0 : stroke.outline,
          borderColor: destructive ? colors.flare : colors.text,
          opacity: primary && pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text
          style={{
            color: label,
            fontFamily: fontFamily.bodyBold,
            fontSize: size,
            lineHeight: Math.round(size * 1.3),
            textAlign: 'center',
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
