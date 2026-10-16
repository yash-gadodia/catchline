import { useRef, useState } from 'react';
import { Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import type { Fit, Size } from '../../analysis/geometry';
import { toScreen } from '../../analysis/geometry';
import type { Point } from '../../analysis/types';
import { colors, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { selection } from '../../lib/haptics';
import { addAnglePoint, addLine, angleAt, canDraw, fromScreen, lineLengthCm, type Shape } from './drawGeometry';

// A touch that travels less than this is a tap (an angle point), more is a line.
const TAP_SLOP = 8;
const ARC = 18;

type Props = {
  box: Size;
  fit: Fit;
  video: Size;
  pxPerCm?: number;
  shapes: Shape[];
  onShapes: (shapes: Shape[]) => void;
  drawing: boolean;
};

const at = (e: GestureResponderEvent): Point => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });

export default function DrawLayer({ box, fit, video, pxPerCm, shapes, onShapes, drawing }: Props) {
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const start = useRef<Point | null>(null);
  const s = (p: Point) => toScreen(p, fit);
  const last = shapes.length - 1;
  const activeIndex = drawing && !drag ? last : -1;

  const release = (to: Point) => {
    const from = start.current;
    start.current = null;
    setDrag(null);
    if (!from || !canDraw(shapes)) return;
    const moved = Math.hypot(to.x - from.x, to.y - from.y) >= TAP_SLOP;
    const next = moved
      ? addLine(shapes, fromScreen(from, fit), fromScreen(to, fit))
      : addAnglePoint(shapes, fromScreen(to, fit));
    selection();
    onShapes(next);
  };

  const labels: { text: string; at: Point; testID: string }[] = [];
  shapes.forEach((shape, i) => {
    if (shape.kind === 'line') {
      const cm = lineLengthCm(shape.points[0], shape.points[1], video, pxPerCm);
      if (cm === null) return;
      const a = s(shape.points[0]);
      const b = s(shape.points[1]);
      labels.push({ text: `${cm.toFixed(1)} cm`, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, testID: `draw-label-${i}` });
    } else if (shape.points.length === 3) {
      const [a, v, c] = shape.points;
      labels.push({ text: `${Math.round(angleAt(a, v, c, video))}°`, at: s(v), testID: `draw-label-${i}` });
    }
  });

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }} pointerEvents="box-none">
      <Svg width={box.width} height={box.height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        {shapes.map((shape, i) => (
          <ShapeMarks key={i} points={shape.points.map(s)} angle={shape.kind === 'angle'} active={i === activeIndex} testID={`draw-shape-${i}`} />
        ))}
        {drag ? <ShapeMarks points={[drag.from, drag.to]} angle={false} active testID="draw-preview" /> : null}
      </Svg>
      {labels.map((l) => (
        <Text
          key={l.testID}
          testID={l.testID}
          style={{
            ...type.readout,
            color: colors.text,
            position: 'absolute',
            left: Math.min(Math.max(4, l.at.x + 10), box.width - 72),
            top: Math.min(Math.max(4, l.at.y - 26), box.height - 22),
            paddingHorizontal: space.s1,
            backgroundColor: colors.scrim,
            fontVariant: ['tabular-nums'],
          }}
        >
          {l.text}
        </Text>
      ))}
      {drawing ? (
        <View
          testID="draw-surface"
          accessibilityLabel="Drawing surface: drag for a line, tap three points for an angle"
          style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            const p = at(e);
            start.current = p;
            setDrag({ from: p, to: p });
          }}
          onResponderMove={(e) => {
            const from = start.current;
            if (from) setDrag({ from, to: at(e) });
          }}
          onResponderRelease={(e) => release(at(e))}
          onResponderTerminate={() => {
            start.current = null;
            setDrag(null);
          }}
        />
      ) : null}
    </View>
  );
}

function ShapeMarks({ points, angle, active, testID }: { points: Point[]; angle: boolean; active: boolean; testID: string }) {
  const color = active ? colors.flare : colors.text;
  return (
    <G testID={testID} stroke={color} strokeWidth={stroke.outline} strokeLinecap="round" fill="none">
      {points.slice(1).map((b, i) => (
        <Line key={i} x1={points[i].x} y1={points[i].y} x2={b.x} y2={b.y} />
      ))}
      {angle && points.length === 3 ? <Path d={arc(points[0], points[1], points[2])} /> : null}
      {points.map((p, i) => (
        <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3} fill={color} stroke="none" />
      ))}
    </G>
  );
}

function arc(a: Point, v: Point, c: Point): string {
  const ua = Math.atan2(a.y - v.y, a.x - v.x);
  const uc = Math.atan2(c.y - v.y, c.x - v.x);
  const start = { x: v.x + ARC * Math.cos(ua), y: v.y + ARC * Math.sin(ua) };
  const end = { x: v.x + ARC * Math.cos(uc), y: v.y + ARC * Math.sin(uc) };
  const cross = (a.x - v.x) * (c.y - v.y) - (a.y - v.y) * (c.x - v.x);
  return `M${start.x.toFixed(1)} ${start.y.toFixed(1)} A${ARC} ${ARC} 0 0 ${cross > 0 ? 1 : 0} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}
