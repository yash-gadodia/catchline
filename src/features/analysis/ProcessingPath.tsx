import { useEffect, useMemo } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, G, Path } from 'react-native-svg';
import { colors } from '../../design/tokens';
import { OverlaySvg } from './overlays';
import { phaseForStep, processingBarPath } from './barPath';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STROKE = 2.5;
const OUTLINE = colors.bg;
const DOT_R = 3.5;

// The silhouette's bar path, drawn in phase by phase as the steps advance.
export default function ProcessingPath({ step, reduce, box }: { step: number; reduce: boolean; box: { width: number; height: number } }) {
  const path = useMemo(() => processingBarPath(box), [box.width, box.height]);
  const phase = phaseForStep(step);
  const target = reduce ? path.total : path.reach[phase];
  const drawn = useSharedValue(reduce ? path.total : 0);
  useEffect(() => {
    drawn.value = reduce ? target : withTiming(target, { duration: 900, easing: Easing.inOut(Easing.cubic) });
  }, [target, reduce, drawn]);
  const dash = useAnimatedProps(() => ({ strokeDashoffset: path.total - drawn.value }));
  const lead = path.ends[reduce ? path.ends.length - 1 : phase];
  return (
    <OverlaySvg box={box}>
      <G testID="processing-path">
        <AnimatedPath
          d={path.d}
          stroke={OUTLINE}
          strokeWidth={STROKE + 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[path.total, path.total]}
          fill="none"
          animatedProps={dash}
        />
        <AnimatedPath
          d={path.d}
          stroke={colors.flare}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[path.total, path.total]}
          fill="none"
          animatedProps={dash}
        />
        {path.ends.map((p, i) =>
          reduce || i < phase ? <Dot key={i} x={p.x} y={p.y} /> : null
        )}
        {reduce ? null : <LeadDot key={phase} x={lead.x} y={lead.y} drawn={drawn} reach={path.reach[phase]} />}
      </G>
    </OverlaySvg>
  );
}

function Dot({ x, y }: { x: number; y: number }) {
  return <Circle testID="processing-path-dot" cx={x} cy={y} r={DOT_R} fill={colors.text} stroke={OUTLINE} strokeWidth={1} />;
}

// The newest phase point: appears when the line reaches it, then breathes.
function LeadDot({ x, y, drawn, reach }: { x: number; y: number; drawn: SharedValue<number>; reach: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1);
  }, [pulse]);
  const props = useAnimatedProps(() => ({
    r: DOT_R + pulse.value * 1.5,
    opacity: drawn.value >= reach - 0.5 ? 1 : 0,
  }));
  return (
    <AnimatedCircle testID="processing-path-lead" cx={x} cy={y} r={DOT_R} fill={colors.text} stroke={OUTLINE} strokeWidth={1} animatedProps={props} />
  );
}
