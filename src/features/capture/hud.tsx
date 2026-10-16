import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Movement } from '../../analysis/types';
import { colors, shape, space, stroke } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { liftById } from '../onboarding/lifts';
import { checkLabel, type CheckResult } from './checks';
import { t } from '../../i18n';

const HUD_BG = 'rgba(0,0,0,0.6)';

export function LiftChip({
  movement,
  onPress,
  scrim,
  height = 40,
}: {
  movement: Movement;
  onPress: () => void;
  scrim?: boolean;
  height?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID="lift-chip"
      accessibilityRole="button"
      accessibilityLabel={t('capture.hud.liftA11y', { name: liftById(movement).name })}
      style={{
        height,
        paddingHorizontal: space.s3,
        borderWidth: stroke.hairline,
        borderColor: colors.text,
        ...shape.control,
        backgroundColor: scrim ? HUD_BG : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s2,
      }}
    >
      <Text style={{ color: colors.text, ...type.label }}>
        {liftById(movement).name}
      </Text>
      <Text style={{ color: colors.text2, ...type.label, fontFamily: fontFamily.body }}>⌄</Text>
    </Pressable>
  );
}

export function HudBadge({
  children,
  dot,
  onPress,
  testID,
  square,
}: {
  children: string;
  dot?: boolean;
  onPress?: () => void;
  testID?: string;
  square?: boolean;
}) {
  const body = (
    <View
      testID={onPress ? undefined : testID}
      style={{
        height: 36,
        minWidth: 36,
        paddingHorizontal: square ? 0 : 10,
        backgroundColor: HUD_BG,
        ...shape.control,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.s2,
      }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.flare }} /> : null}
      <Text
        style={{
          color: colors.text,
          fontFamily: square ? fontFamily.bodyBold : fontFamily.mono,
          fontSize: square ? 17 : 13,
          lineHeight: square ? 22 : 18,
        }}
      >
        {children}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" hitSlop={8}>
      {body}
    </Pressable>
  );
}

export function CheckList({ results }: { results: CheckResult[] }) {
  return (
    <View style={{ gap: 6, alignItems: 'flex-start' }} testID="check-list">
      {results.map((r) => (
        <View
          key={r.id}
          testID={`check-${r.id}-${r.pass === null ? 'guide' : r.pass ? 'pass' : 'fail'}`}
          style={{ backgroundColor: colors.scrim, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', gap: 10 }}
        >
          {r.pass === null ? null : (
            <Text style={{ color: r.pass ? colors.text : colors.flare, ...type.readout }}>
              {r.pass ? '✓' : '✕'}
            </Text>
          )}
          <Text style={{ color: colors.text, ...type.readout }}>{checkLabel(r.id)}</Text>
        </View>
      ))}
    </View>
  );
}

// 56pt square, 4px radius. Idle: flare fill. Recording: bone outline with a
// small flare stop square.
export function RecordButton({
  recording,
  onPress,
  style,
}: {
  recording: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID="record-button"
      accessibilityRole="button"
      accessibilityLabel={recording ? t('capture.hud.stopRecording') : t('capture.hud.record')}
      style={({ pressed }) => [
        {
          width: 56,
          height: 56,
          ...shape.control,
          backgroundColor: recording ? 'transparent' : colors.flare,
          borderWidth: recording ? stroke.outline : 0,
          borderColor: colors.text,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {recording ? <View style={{ width: 22, height: 22, ...shape.control, backgroundColor: colors.flare }} /> : null}
    </Pressable>
  );
}

export function Underlined({ children, onPress, testID }: { children: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" hitSlop={10}>
      <Text
        style={{ color: colors.text, ...type.label, textDecorationLine: 'underline' }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function Meta({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} numberOfLines={1} style={{ color: colors.text2, ...type.readout }}>
      {children}
    </Text>
  );
}

export function Header({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <View
      style={{
        height: 56,
        paddingHorizontal: space.gutter,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ minWidth: 60 }}>{left}</View>
      {center}
      <View style={{ minWidth: 60, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
