import { useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import type { Size } from '../../analysis/geometry';
import type { Point } from '../../analysis/types';
import { colors, opacity, shape, stroke } from '../../design/tokens';
import { t } from '../../i18n';
import { OverlaySvg } from './overlays';

// The coach's reference tools over the video (owner, 14-11: parity with WL Analysis): a grid, a vertical line to
// drag, and freehand strokes. All live for the session only.

const GRID_COLUMNS = 6;
const LINE_HIT = 44;
const LINE_STEP = 0.01;

// Square cells, GRID_COLUMNS across the picture: where the lines fall, in points.
export function gridLines(box: Size, columns = GRID_COLUMNS): { xs: number[]; ys: number[] } {
  const cell = box.width / columns;
  const xs = Array.from({ length: columns - 1 }, (_, i) => (i + 1) * cell);
  const ys: number[] = [];
  for (let y = cell; y < box.height - 0.5; y += cell) ys.push(y);
  return { xs, ys };
}

export function Grid({ box }: { box: Size }) {
  const { xs, ys } = gridLines(box);
  return (
    <OverlaySvg box={box}>
      <G testID="ref-grid" stroke={colors.text} strokeWidth={stroke.hairline} opacity={opacity.strobeMin}>
        {xs.map((x) => (
          <Line key={`x${x}`} x1={x} x2={x} y1={0} y2={box.height} />
        ))}
        {ys.map((y) => (
          <Line key={`y${y}`} x1={0} x2={box.width} y1={y} y2={y} />
        ))}
      </G>
    </OverlaySvg>
  );
}

const unit = (v: number) => Math.min(Math.max(v, 0), 1);

// A vertical line to judge whether the bar drifts forward: `x` is a fraction of the picture's width. Dragging
// anywhere on it moves it; VoiceOver moves it a step at a time.
export function PlumbLine({ box, x, onMove }: { box: Size; x: number; onMove: (x: number) => void }) {
  const start = useRef<{ page: number; x: number } | null>(null);
  return (
    <View
      testID="ref-plumb"
      accessibilityRole="adjustable"
      accessibilityLabel={t('analysis.tracker.plumbHandle')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(x * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onMove(unit(x + (e.nativeEvent.actionName === 'increment' ? LINE_STEP : -LINE_STEP)))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => (start.current = { page: e.nativeEvent.pageX, x })}
      onResponderMove={(e) => {
        if (start.current) onMove(unit(start.current.x + (e.nativeEvent.pageX - start.current.page) / box.width));
      }}
      onResponderRelease={() => (start.current = null)}
      onResponderTerminate={() => (start.current = null)}
      style={{ position: 'absolute', top: 0, left: x * box.width - LINE_HIT / 2, width: LINE_HIT, height: box.height, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* bone on a black halo, like the path, so it reads on a bright wall and a dark one */}
      <View pointerEvents="none" style={{ width: stroke.halo, height: box.height, backgroundColor: colors.halo, alignItems: 'center' }}>
        <View style={{ width: stroke.outline, height: box.height, backgroundColor: colors.text }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', width: 12, height: 32, backgroundColor: colors.text, borderWidth: stroke.hairline, borderColor: colors.halo, ...shape.control }} />
    </View>
  );
}

const strokePath = (points: Point[], box: Size) => {
  const p = points.length === 1 ? [points[0], points[0]] : points;
  return p.map((q, i) => `${i ? 'L' : 'M'}${(q.x * box.width).toFixed(1)} ${(q.y * box.height).toFixed(1)}`).join(' ');
};

// Freehand strokes in flare, kept as fractions of the picture so they stay put when the video is resized. While
// `drawing`, a surface over the video takes every touch (so a touch draws rather than plays or pauses).
export function Freehand({ box, strokes, onStrokes, drawing }: { box: Size; strokes: Point[][]; onStrokes: (strokes: Point[][]) => void; drawing: boolean }) {
  const [live, setLive] = useState<Point[] | null>(null);
  const points = useRef<Point[] | null>(null);
  const at = (e: GestureResponderEvent): Point => ({ x: unit(e.nativeEvent.locationX / box.width), y: unit(e.nativeEvent.locationY / box.height) });
  const end = () => {
    points.current = null;
    setLive(null);
  };
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }} pointerEvents="box-none">
      <Svg width={box.width} height={box.height} pointerEvents="none">
        <G stroke={colors.flare} strokeWidth={stroke.path} strokeLinecap="round" strokeLinejoin="round" fill="none">
          {strokes.map((s, i) => (
            <Path key={i} testID={`freehand-stroke-${i}`} d={strokePath(s, box)} />
          ))}
          {live ? <Path testID="freehand-live" d={strokePath(live, box)} /> : null}
        </G>
      </Svg>
      {drawing ? (
        <View
          testID="freehand-surface"
          accessibilityLabel={t('analysis.tracker.freehandSurface')}
          style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            points.current = [at(e)];
            setLive(points.current);
          }}
          onResponderMove={(e) => {
            if (!points.current) return;
            points.current = [...points.current, at(e)];
            setLive(points.current);
          }}
          onResponderRelease={() => {
            if (points.current) onStrokes([...strokes, points.current]);
            end();
          }}
          onResponderTerminate={end}
        />
      ) : null}
    </View>
  );
}
