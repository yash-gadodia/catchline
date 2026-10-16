import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';
import { colors, stroke } from '../../design/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A flare path revealed by its dash offset; progress 0..1 is how much is drawn.
export default function DrawnPath({
  d,
  length,
  progress,
  halo = true,
}: {
  d: string;
  length: number;
  progress: SharedValue<number>;
  halo?: boolean;
}) {
  const dash = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  return (
    <G testID="drawn-path">
      {halo ? (
        <AnimatedPath
          d={d}
          stroke={colors.halo}
          strokeWidth={stroke.halo}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[length, length]}
          fill="none"
          animatedProps={dash}
        />
      ) : null}
      <AnimatedPath
        d={d}
        stroke={colors.flare}
        strokeWidth={stroke.path}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={[length, length]}
        fill="none"
        animatedProps={dash}
      />
    </G>
  );
}
