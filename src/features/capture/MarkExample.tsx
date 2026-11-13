import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors, stroke } from '../../design/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// drawn on a 100-unit square and scaled to `size`
const C = 50;
const PLATE = 38;
const ANGLE = -Math.PI / 5;
const LOOP_MS = 2800;

// The gesture shown, not described: a finger presses on the middle of a plate (side on, the bar's sleeve pointing at
// the camera, as in a lift video) and drags out to its rim while the red circle grows with it, then holds. Reduced
// motion shows the finished mark.
export default function MarkExample({ size = 88 }: { size?: number }) {
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
    <Svg testID="mark-example" width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* the bar running away from the camera, behind the plate */}
      <Rect x={0} y={C - 3} width={C} height={6} rx={3} fill={colors.text3} />
      {/* a bumper plate: rubber rim, insert, steel hub, the sleeve's end in the middle */}
      <Circle cx={C} cy={C} r={PLATE} fill={colors.surface2} stroke={colors.text3} strokeWidth={stroke.outline} />
      <Circle cx={C} cy={C} r={PLATE * 0.72} fill="none" stroke={colors.hairline} strokeWidth={stroke.ghost} />
      <Circle cx={C} cy={C} r={PLATE * 0.3} fill={colors.text3} />
      <Circle cx={C} cy={C} r={PLATE * 0.16} fill={colors.text2} />
      <AnimatedCircle cx={C} cy={C} stroke={colors.flare} strokeWidth={stroke.halo} fill="none" animatedProps={ring} />
      <AnimatedCircle r={9} fill={colors.text} fillOpacity={0.35} stroke={colors.text} strokeWidth={2} animatedProps={finger} />
    </Svg>
  );
}
