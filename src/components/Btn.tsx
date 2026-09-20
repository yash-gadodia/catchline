import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Press from './Press';
import { lightTick } from '../lib/haptics';
import { colors, gradients, radius, shadows } from '../design/tokens';
import { fontFamily } from '../design/typography';

type BtnKind = 'ink' | 'us' | 'coral' | 'soft';

interface BtnProps {
  children: React.ReactNode;
  onPress?: () => void;
  kind?: BtnKind;
  sub?: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}

const palettes: Record<
  BtnKind,
  { bg?: string; fg: string; bd?: string; gradient?: boolean }
> = {
  ink: { bg: colors.ink, fg: '#fff' },
  us: { fg: '#fff', gradient: true },
  coral: { bg: colors.p1Deep, fg: '#fff' },
  soft: { bg: colors.surface, fg: colors.ink, bd: `1px solid ${colors.line}` },
};

export default function Btn({
  children,
  onPress,
  kind = 'ink',
  sub,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: BtnProps) {
  const palette = palettes[kind];
  const isGradient = palette.gradient && kind === 'us';

  const innerContent = (
    <View
      style={{
        minHeight: 58,
        borderRadius: radius.pill,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        gap: 2,
        ...(disabled && {
          backgroundColor: colors.sunken,
        }),
        ...(!disabled &&
          !isGradient && {
            backgroundColor: palette.bg,
          }),
        ...(disabled && {
          borderColor: colors.sunken,
        }),
        ...(kind === 'soft' && {
          borderWidth: 1,
          borderColor: colors.line,
        }),
        ...(!disabled && shadows.shadowSoft),
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 16.5,
          fontWeight: '700',
          lineHeight: 20,
          color: disabled ? colors.inkMute : palette.fg,
          fontFamily: fontFamily.ui,
        }}
      >
        {children}
      </Text>
      {sub && (
        <Text
          allowFontScaling={false}
          style={{
            fontSize: 9.5,
            lineHeight: 12,
            fontFamily: fontFamily.mono,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            opacity: 0.8,
            color: disabled ? colors.inkMute : palette.fg,
          }}
        >
          {sub}
        </Text>
      )}
    </View>
  );

  const content = isGradient ? (
    <LinearGradient
      colors={gradients.us.colors}
      locations={gradients.us.locations}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: radius.pill,
        overflow: 'hidden',
      }}
    >
      {innerContent}
    </LinearGradient>
  ) : (
    innerContent
  );

  const derivedLabel = accessibilityLabel
    ?? [typeof children === 'string' ? children : '', sub].filter(Boolean).join(', ');

  return (
    <Press
      onPress={() => {
        lightTick();
        onPress?.();
      }}
      disabled={disabled}
      style={style}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={derivedLabel}
      accessibilityState={{ disabled }}
    >
      {content}
    </Press>
  );
}
