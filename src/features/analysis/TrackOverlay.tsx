import { useMemo } from 'react';
import { Circle, G, Line, Path } from 'react-native-svg';
import type { Analysis, Point } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { svgPath, toScreen, type Size } from '../../analysis/geometry';
import { pointAt } from '../../analysis/timeline';
import { colors, opacity, stroke } from '../../design/tokens';
import { CurrentDot, FlarePath, OverlaySvg, RefLine } from './overlays';
import { bones, drawnPaths, drawnSide, floorY, joints, repStarts, startLineX } from './tracker';

// What is drawn on the clip at one frame: the start and floor lines, the body, the path so far and its dot.
// The tracker screen and the share preview show it; modules/clip-transcoder TrackRenderer.swift burns the same in.
export default function TrackOverlay({
  analysis,
  body,
  frame,
  box,
  show,
  ghost,
  speed,
  whole,
}: {
  analysis: Analysis;
  body: Body | null;
  frame: number;
  box: Size;
  show: { path: boolean; lines: boolean; body: boolean };
  // An earlier lift's bar path, already in this video's coordinates (compare.ts): a faint bone line under today's.
  ghost?: Point[] | null;
  // bar speed by frame (speed.ts): colours the path by how fast the bar is moving
  speed?: Map<number, number> | null;
  // the player: every rep of the set is drawn faint from the first frame, the rep on screen bright over it as it
  // plays. Off for the share preview, which shows what TrackRenderer.swift burns in.
  whole?: boolean;
}) {
  const s = (p: Point) => toScreen(p, { x: 0, y: 0, width: box.width, height: box.height });
  // where each rep of the set starts, read once per lift (the path does not change while it plays)
  const starts = useMemo(() => repStarts(analysis.reps[0]?.path ?? [], analysis.video.fps || 30), [analysis]);
  const drawn = drawnPaths(analysis, frame, starts);
  const rep = analysis.reps[0];
  const path = rep?.path ?? [];
  // full flare is the lift's fastest pull (a drop is faster still and would leave the whole pull pale)
  const fastest = useMemo(() => (speed?.size ? Math.max(...speed.values()) : 0), [speed]);
  const heat = speed && fastest > 0 ? (f: number) => Math.min(1, Math.abs(speed.get(f) ?? speed.get(f - 1) ?? speed.get(f + 1) ?? 0) / fastest) : null;
  const current = path.length && frame >= path[0].frame && frame <= path[path.length - 1].frame ? pointAt(path, frame) : null;
  const j = show.body ? joints(body, frame) : [];
  const side = drawnSide(body, analysis.noCueReason?.offSideDeg);
  const shownJoints = side === 'both' ? j : j.filter((_, i) => i % 2 === side);
  const skeleton = bones(j, side).map(([a, b]) => [s(a), s(b)] as const);
  const startX = startLineX(rep);
  const floor = floorY(body);
  return (
    <OverlaySvg box={box}>
      {show.lines ? (
        <G testID="tracker-lines">
          {startX != null ? <RefLine x={s({ x: startX, y: 0 }).x} top={0} bottom={box.height} /> : null}
          {floor != null ? (
            <Line x1={0} x2={box.width} y1={s({ x: 0, y: floor }).y} y2={s({ x: 0, y: floor }).y} stroke={colors.text} strokeWidth={stroke.hairline} strokeDasharray="2 5" opacity={opacity.lines} />
          ) : null}
        </G>
      ) : null}
      {show.body ? (
        <G testID="tracker-body" strokeLinecap="round">
          {skeleton.map(([p, q], i) => (
            <Line key={`h${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colors.halo} strokeWidth={stroke.halo} />
          ))}
          {skeleton.map(([p, q], i) => (
            <Line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colors.text} strokeWidth={stroke.outline} />
          ))}
          {shownJoints.map((p, i) => (p ? <Circle key={`j${i}`} cx={s(p).x} cy={s(p).y} r={3} fill={colors.text} stroke={colors.halo} strokeWidth={1} /> : null))}
        </G>
      ) : null}
      {ghost && ghost.length > 1 ? (
        <Path testID="path-ghost" d={svgPath(ghost.map(s))} stroke={colors.text} strokeWidth={stroke.ghost} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 5" opacity={opacity.lines} fill="none" />
      ) : null}
      {show.path ? (
        <>
          {/* earlier reps of the set (in the player every rep), faint and dotted like a compared lift; the rep on screen in flare */}
          {(whole ? drawn.whole : drawn.earlier).map((seg, i) => (
            <Path key={i} testID={whole ? 'path-whole' : 'path-earlier'} d={svgPath(seg.map(s))} stroke={colors.text} strokeWidth={stroke.ghost} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 5" opacity={opacity.lines} fill="none" />
          ))}
          <FlarePath points={drawn.current.map(s)} heat={heat ? drawn.current.map((p) => heat(p.frame)) : undefined} testID="path-done" />
          <CurrentDot point={current ? s(current) : null} />
        </>
      ) : null}
    </OverlaySvg>
  );
}
