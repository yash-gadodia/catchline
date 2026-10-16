import type { ReactNode } from 'react';
import { Text } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline } from 'react-native-svg';
import type { Point } from '../../analysis/types';
import { svgPath } from '../../analysis/geometry';
import { colors, opacity, stroke } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import type { Size } from '../../analysis/geometry';

export function OverlaySvg({ box, children }: { box: Size; children: ReactNode }) {
  return (
    <Svg
      width={box.width}
      height={box.height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
    >
      {children}
    </Svg>
  );
}

// Flare path: 2.5pt, round caps, a thin black outline.
export function FlarePath({
  points,
  dashed,
  faint,
  halo = true,
  testID,
}: {
  points: Point[];
  dashed?: boolean;
  faint?: boolean;
  halo?: boolean;
  testID?: string;
}) {
  if (points.length < 2) return null;
  const d = svgPath(points);
  return (
    <G testID={testID} opacity={faint ? 0.35 : 1}>
      {halo && !faint ? (
        <Path d={d} stroke={colors.halo} strokeWidth={stroke.halo} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : null}
      <Path
        d={d}
        stroke={colors.flare}
        strokeWidth={stroke.path}
        strokeLinecap={dashed ? 'butt' : 'round'}
        strokeLinejoin="round"
        strokeDasharray={dashed ? '8 6' : undefined}
        fill="none"
      />
    </G>
  );
}

export function GhostPath({ points, testID }: { points: Point[]; testID?: string }) {
  if (points.length < 2) return null;
  return (
    <Path
      testID={testID}
      d={svgPath(points)}
      stroke={colors.text}
      strokeWidth={stroke.ghost}
      strokeDasharray="6 4"
      opacity={opacity.lines}
      fill="none"
    />
  );
}

export function KeyDots({ points }: { points: Point[] }) {
  return (
    <G fill={colors.text} stroke={colors.halo} strokeWidth={1}>
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} />
      ))}
    </G>
  );
}

export function CurrentDot({ point }: { point: Point | null }) {
  if (!point) return null;
  return <Circle cx={point.x} cy={point.y} r={4.5} fill={colors.flare} stroke={colors.halo} strokeWidth={1.5} />;
}

export function RefLine({ x, top, bottom, alpha = opacity.lines }: { x: number; top: number; bottom: number; alpha?: number }) {
  return (
    <Line
      x1={x}
      y1={top}
      x2={x}
      y2={bottom}
      stroke={colors.text}
      strokeWidth={stroke.hairline}
      strokeDasharray="2 5"
      opacity={alpha}
    />
  );
}

// Horizontal dimension line: arrowheads, or end caps when the span is too
// short for arrowheads to read.
export function DimensionLine({ from, to, testID }: { from: Point; to: Point; testID?: string }) {
  const y = to.y;
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const short = right - left < 20;
  return (
    <G testID={testID} stroke={colors.flare} strokeWidth={stroke.outline} fill="none">
      <Line x1={left} y1={y} x2={right} y2={y} />
      {short ? (
        <>
          <Line x1={left} y1={y - 6} x2={left} y2={y + 6} />
          <Line x1={right} y1={y - 6} x2={right} y2={y + 6} />
        </>
      ) : (
        <>
          <Polyline points={`${left + 6},${y - 5} ${left},${y} ${left + 6},${y + 5}`} />
          <Polyline points={`${right - 6},${y - 5} ${right},${y} ${right - 6},${y + 5}`} />
        </>
      )}
    </G>
  );
}

export function HeroNumber({
  text,
  at,
  size = 48,
  box,
  minTop = 8,
}: {
  text: string;
  at: Point;
  size?: number;
  box: Size;
  minTop?: number;
}) {
  const width = text.length * size * 0.42;
  const left = Math.min(Math.max(8, at.x), box.width - width - 8);
  const top = Math.max(minTop, at.y - size - 6);
  return (
    <Text
      testID="hero-number"
      style={{
        position: 'absolute',
        left,
        top,
        color: colors.flare,
        fontFamily: fontFamily.displayBlack,
        fontSize: size,
        lineHeight: size,
        letterSpacing: size * -0.02,
        textShadowColor: colors.halo,
        textShadowRadius: 6,
        textShadowOffset: { width: 0, height: 0 },
      }}
    >
      {text}
    </Text>
  );
}
