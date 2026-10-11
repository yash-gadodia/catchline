import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { Movement } from '../../analysis/types';
import { colors } from '../../design/tokens';

export type Pose = 'standing' | 'hanging' | 'inverted';

export function poseFor(m: Movement): Pose {
  if (m === 'kipping_pull_up' || m === 'bar_muscle_up') return 'hanging';
  if (m === 'kipping_hspu') return 'inverted';
  return 'standing';
}

// Faint side-on figure on a 390x844 canvas, sliced to the screen: where the
// lifter should stand, with the bar line (hip height, pull-up bar or wall).
export default function Silhouette({ movement, width, height }: { movement: Movement; width: number; height: number }) {
  const pose = poseFor(movement);
  return (
    <Svg
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
      testID={`silhouette-${pose}`}
    >
      {pose === 'standing' ? (
        <>
          <Line x1={40} y1={470} x2={350} y2={470} stroke={colors.text} strokeWidth={1} strokeDasharray="4 6" opacity={0.5} />
          <G fill={colors.text} opacity={0.18}>
            <Circle cx={195} cy={300} r={22} />
            <Path d="M175 326 L215 326 L228 440 L216 560 L196 560 L198 470 L186 470 L180 560 L160 560 L166 440Z" />
          </G>
        </>
      ) : null}
      {pose === 'hanging' ? (
        <>
          <Line x1={40} y1={200} x2={350} y2={200} stroke={colors.text} strokeWidth={2} opacity={0.5} />
          <G fill={colors.text} opacity={0.16}>
            <Rect x={170} y={200} width={14} height={60} rx={6} />
            <Rect x={206} y={200} width={14} height={60} rx={6} />
            <Circle cx={195} cy={285} r={22} />
            <Path d="M175 310 L215 310 L226 430 L216 560 L198 560 L198 460 L192 460 L190 560 L172 560 L164 430Z" />
          </G>
        </>
      ) : null}
      {pose === 'inverted' ? (
        <>
          <Line x1={300} y1={80} x2={300} y2={700} stroke={colors.text} strokeWidth={2} opacity={0.4} />
          <G fill={colors.text} opacity={0.16}>
            <Circle cx={230} cy={620} r={22} />
            <Path d="M212 596 L248 596 L262 470 L258 330 L240 330 L236 450 L226 450 L220 330 L202 330 L200 470Z" />
            <Rect x={196} y={620} width={12} height={70} rx={5} />
            <Rect x={252} y={620} width={12} height={70} rx={5} />
          </G>
          <Line x1={40} y1={700} x2={350} y2={700} stroke={colors.text} strokeWidth={1} strokeDasharray="4 6" opacity={0.35} />
        </>
      ) : null}
    </Svg>
  );
}
