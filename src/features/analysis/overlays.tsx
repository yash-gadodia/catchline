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
const HEAT_STEPS = [0.15, 0.45, 0.75, 1];

export function FlarePath({
  points,
  dashed,
  faint,
  halo = true,
  heat,
  testID,
}: {
  points: Point[];
  // how fast the bar is at each point, 0 (still) to 1 (the lift's fastest): the path runs from bone to flare with it
  heat?: number[];
  dashed?: boolean;
  faint?: boolean;
  halo?: boolean;
  testID?: string;
}) {
  if (points.length < 2) return null;
  const d = svgPath(points);
  if (heat && heat.length === points.length) {
    // four steps of flare over a bone line: one path per step, not one per frame
    const steps = HEAT_STEPS.map(() => '');
    for (let i = 1; i < points.length; i++) {
      const k = Math.min(HEAT_STEPS.length - 1, Math.floor(((heat[i - 1] + heat[i]) / 2) * HEAT_STEPS.length));
      steps[k] += `M${points[i - 1].x} ${points[i - 1].y}L${points[i].x} ${points[i].y}`;
    }
    return (
      <G testID={testID} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {halo ? <Path d={d} stroke={colors.halo} strokeWidth={stroke.halo} /> : null}
        <Path d={d} stroke={colors.text} strokeWidth={stroke.path} />
        {steps.map((sd, k) => (sd ? <Path key={k} testID={`path-heat-${k}`} d={sd} stroke={colors.flare} strokeWidth={stroke.path} opacity={HEAT_STEPS[k]} /> : null))}
      </G>
    );
  }
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

