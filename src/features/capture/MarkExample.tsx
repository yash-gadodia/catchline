import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors, stroke } from '../../design/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 88;
const C = SIZE / 2;
const PLATE = 34;
const ANGLE = -Math.PI / 5;
const LOOP_MS = 2800;

// The gesture shown, not described: a finger presses on the plate's middle and drags out to its rim while the
// circle grows with it, then holds. Reduced motion shows the finished mark.
export default function MarkExample() {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 0.7 : 0);
  useEffect(() => {
    if (!reduce) t.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1);
  }, [reduce, t]);

  // 0-0.15 press, 0.15-0.6 drag out, 0.6-0.9 hold, 0.9-1 fade
  const reach = (v: number) => {
    'worklet';
    if (v < 0.15) return 0;
    const k = Math.min((v - 0.15) / 0.45, 1);
    return k * k * (3 - 2 * k);
  };
  const fade = (v: number) => {
    'worklet';
    return v > 0.9 ? (1 - v) / 0.1 : 1;
  };
  const ring = useAnimatedProps(() => ({ r: Math.max(reach(t.value) * PLATE, 0.01), opacity: fade(t.value) }));
  const finger = useAnimatedProps(() => {
    const d = reach(t.value) * PLATE;
    return { cx: C + Math.cos(ANGLE) * d, cy: C + Math.sin(ANGLE) * d, opacity: fade(t.value) };
  });

  return (
    <Svg testID="mark-example" width={SIZE} height={SIZE} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={0} y1={C} x2={C} y2={C} stroke={colors.text3} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={C} cy={C} r={PLATE} stroke={colors.text3} strokeWidth={stroke.outline} fill={colors.surface2} />
      <Circle cx={C} cy={C} r={PLATE * 0.62} stroke={colors.hairline} strokeWidth={stroke.hairline} fill="none" />
      <Circle cx={C} cy={C} r={6} fill={colors.text3} />
      <AnimatedCircle cx={C} cy={C} stroke={colors.flare} strokeWidth={stroke.path} fill="none" animatedProps={ring} />
      <AnimatedCircle r={9} fill={colors.text} fillOpacity={0.35} stroke={colors.text} strokeWidth={1.5} animatedProps={finger} />
    </Svg>
  );
}
