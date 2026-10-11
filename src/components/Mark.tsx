import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../design/tokens';
import { lightTick } from '../lib/haptics';

// The Catchline monogram: a C of bone with the flare dot on its top tip.
// Source: ~/dev/liftcheck-research/brand/mark.svg (viewBox 160).
const C = 'M118 48 A46 46 0 1 0 118 112';
// The same arc drawn the other way, bottom tip round to the top, for the launch draw.
const C_DRAW = 'M118 112 A46 46 0 1 1 118 48';
const STROKE = 26;
const DOT_R = 17;
const ARC_LENGTH = 220;

export const DRAW_DELAY_MS = 200;
export const DRAW_MS = 900;
export const DOT_AT_MS = 1050;
export const DOT_MS = 350;
export const MARK_DONE_MS = DOT_AT_MS + DOT_MS;

export default function Mark({ size, testID }: { size: number; testID?: string }) {
  return (
    <Svg viewBox="0 0 160 160" width={size} height={size} fill="none" testID={testID}>
      <Path d={C} stroke={colors.text} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={118} cy={48} r={DOT_R} fill={colors.flare} />
    </Svg>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The launch draw: the arc strokes in from the bottom tip, then the dot pops
// (0 → 1.25 → 1) with a light haptic as it lands. Reduce Motion shows the final
// mark at once. `onDone` fires when the mark is complete.
export function AnimatedMark({ size, onDone }: { size: number; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(reduced ? 0 : ARC_LENGTH);
  const scale = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    offset.value = withDelay(DRAW_DELAY_MS, withTiming(0, { duration: DRAW_MS, easing: Easing.bezier(0.3, 0.8, 0.2, 1) }));
    const pop = Easing.bezier(0.2, 1.4, 0.4, 1);
    scale.value = withDelay(
      DOT_AT_MS,
      withSequence(withTiming(1.25, { duration: DOT_MS * 0.6, easing: pop }), withTiming(1, { duration: DOT_MS * 0.4, easing: pop }))
    );
    const land = setTimeout(() => lightTick(), DOT_AT_MS + DOT_MS * 0.6);
    const done = setTimeout(() => onDone?.(), MARK_DONE_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(done);
    };
  }, [reduced]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  const dotProps = useAnimatedProps(() => ({ r: DOT_R * scale.value }));

  return (
    <Svg viewBox="0 0 160 160" width={size} height={size} fill="none" testID="animated-mark">
      <AnimatedPath
        d={C_DRAW}
        stroke={colors.text}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={ARC_LENGTH}
        animatedProps={arcProps}
      />
      <AnimatedCircle cx={118} cy={48} fill={colors.flare} animatedProps={dotProps} />
    </Svg>
  );
}

// Shown over the app right after the native splash (the same static mark on
// black), so the hand-off is seamless: hide the native splash once this is on
// screen, play the draw, then get out of the way.
export function LaunchOverlay({ onShown, onDone }: { onShown: () => void; onDone: () => void }) {
  return (
    <View
      testID="launch-overlay"
      accessibilityLabel="Catchline"
      onLayout={onShown}
      style={{ position: 'absolute', inset: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <AnimatedMark size={160} onDone={onDone} />
    </View>
  );
}
