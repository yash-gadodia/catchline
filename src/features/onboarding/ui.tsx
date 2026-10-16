import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Btn from '../../components/Btn';
import { colors, control, shade, shape, space, stroke } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';

export function Title({ children, size = 40 }: { children: string; size?: number }) {
  return <Text style={[display(size), { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, color = colors.text2, size = 17 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <Text style={{ color, fontFamily: fontFamily.body, fontSize: size, lineHeight: Math.round(size * 1.4) }}>
      {children}
    </Text>
  );
}

// Btn with a blocked state (the shared atom has none): surface fill, text-3 label.
export function GateBtn({
  children,
  onPress,
  disabled,
  testID,
  style,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!disabled) {
    return (
      <Btn onPress={onPress} testID={testID} style={style}>
        {children}
      </Btn>
    );
  }
  return (
    <Pressable
      disabled
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={[
        {
          height: control.height,
          ...shape.control,
          backgroundColor: colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={[type.button, { color: colors.text3 }]}>{children}</Text>
    </Pressable>
  );
}

// Destructive action: flare outline, flare text, no fill.
export function DestructiveBtn({ children, onPress, testID }: { children: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: control.height,
        ...shape.control,
        borderWidth: stroke.outline,
        borderColor: colors.flare,
        backgroundColor: pressed ? colors.surface2 : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.s4,
      })}
    >
      <Text numberOfLines={1} style={[type.button, { color: colors.flare }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onToggle,
  children,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={{ flexDirection: 'row', gap: space.s4, alignItems: 'flex-start' }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderWidth: stroke.outline,
          borderColor: checked ? colors.text : colors.hairline,
          ...shape.control,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          // design-ok: the check glyph is sized to its box, not a text style
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 18, lineHeight: 22 }}>✓</Text>
        ) : null}
      </View>
      <View style={{ flex: 1, paddingTop: 3 }}>{children}</View>
    </Pressable>
  );
}

// Left-ruled note: bone rule for a warning the lifter can override, flare
// when the action is blocked.
export function Note({
  title,
  children,
  blocked,
  scrim,
  testID,
  style,
}: {
  title?: string;
  children: string;
  blocked?: boolean;
  scrim?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      testID={testID}
      style={[
        {
          paddingVertical: space.s3,
          paddingHorizontal: space.s4,
          borderLeftWidth: stroke.outline,
          borderLeftColor: blocked ? colors.flare : colors.text,
          backgroundColor: scrim ? shade(0.75) : colors.surface,
          gap: 2,
        },
        style,
      ]}
    >
      {title ? (
        <Text style={{ color: colors.text, ...type.callout, fontFamily: fontFamily.bodyBold }}>{title}</Text>
      ) : null}
      <Text
        style={{ color: title ? colors.text2 : colors.text, ...type.callout }}
      >
        {children}
      </Text>
    </View>
  );
}

export function Screen({ children, top, bottom, testID }: { children: ReactNode; top: number; bottom: number; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: top + space.s7,
        paddingBottom: Math.max(bottom, space.s4) + space.s5,
        paddingHorizontal: space.gutter,
        gap: space.s5,
      }}
    >
      {children}
    </View>
  );
}
