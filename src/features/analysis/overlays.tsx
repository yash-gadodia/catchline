import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Point, RepGuides } from '../../analysis/types';
import { svgPath } from '../../analysis/geometry';
import { colors, opacity, stroke } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { t } from '../../i18n';
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

const inFrame = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// The coaching reference lines on a barbell rep (PR #154 reel): knee, hip and peak heights across the frame, labelled
// at the left, and the ring on the bar where it was furthest forward when `ring` is on.
export function Guides({ guides, toScreen, box, ring }: { guides: RepGuides; toScreen: (p: Point) => Point; box: Size; ring: boolean }) {
  const rows = (
    [
      ['knee', guides.kneeY],
      ['hip', guides.hipY],
      ['peak', guides.peakY],
    ] as const
  ).filter((row): row is [(typeof row)[0], number] => inFrame(row[1]));
  const r = guides.ring;
  return (
    <G testID="guides">
      {rows.map(([name, y]) => {
        const sy = toScreen({ x: 0, y }).y;
        return (
          <G key={name} testID={`guide-${name}`} opacity={opacity.lines}>
            <Line x1={0} y1={sy} x2={box.width} y2={sy} stroke={colors.text} strokeWidth={stroke.hairline} strokeDasharray="2 5" />
            <SvgText x={8} y={sy - 4} fill={colors.text} fontSize={10} fontFamily={fontFamily.mono}>
              {t(`analysis.guides.${name}`)}
            </SvgText>
          </G>
        );
      })}
      {ring && inFrame(r.x) && inFrame(r.y) ? (
        <Circle testID="guide-ring" cx={toScreen(r).x} cy={toScreen(r).y} r={14} stroke={colors.flare} strokeWidth={stroke.outline} fill="none" />
      ) : null}
    </G>
  );
}

