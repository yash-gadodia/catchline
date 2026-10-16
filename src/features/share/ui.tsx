import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { colors, shape, space, stroke } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';

export function Chip({
  label,
  on,
  onPress,
  mono,
  disabled,
  testID,
}: {
  label: string;
  on: boolean;
  onPress?: () => void;
  mono?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      style={{
        height: mono ? 32 : 36,
        paddingHorizontal: mono ? 10 : 12,
        borderWidth: 1,
        borderColor: on ? colors.text : colors.hairline,
        ...shape.control,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: disabled ? colors.text3 : on ? colors.text : colors.text2,
          fontFamily: mono ? fontFamily.mono : on ? fontFamily.bodyMedium : fontFamily.body,
          fontSize: mono ? 12 : 13,
          lineHeight: mono ? 16 : 18,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Toggle({ value, onChange, testID }: { value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      testID={testID}
      trackColor={{ false: colors.surface2, true: colors.text }}
      thumbColor={value ? colors.bg : colors.text3}
      ios_backgroundColor={colors.surface2}
    />
  );
}

export function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: space.s3,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <Text style={{ color: colors.text, ...type.body }}>{label}</Text>
      <Toggle value={value} onChange={onChange} testID={testID} />
    </View>
  );
}

export function SheetTitle({ children, size = 22 }: { children: string; size?: number }) {
  return (
    <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: size, lineHeight: Math.round(size * 1.3) }}>
      {children}
    </Text>
  );
}

export function Body({ children, color = colors.text2, testID }: { children: ReactNode; color?: string; testID?: string }) {
  return (
    <Text testID={testID} style={{ color, ...type.callout }}>
      {children}
    </Text>
  );
}

// Destructive action: flare outline, flare text, no fill. Disabled drops to hairline.
export function DangerBtn({
  children,
  onPress,
  disabled,
  compact,
  testID,
}: {
  children: string;
  onPress?: () => void;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: compact ? 1 : undefined,
        height: compact ? 48 : 56,
        ...shape.control,
        borderWidth: stroke.outline,
        borderColor: disabled ? colors.hairline : colors.flare,
        backgroundColor: pressed && !disabled ? colors.surface2 : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text
        style={{
          color: disabled ? colors.text3 : colors.flare,
          fontFamily: fontFamily.bodyBold,
          fontSize: compact ? 15 : 17,
          lineHeight: compact ? 20 : 22,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
