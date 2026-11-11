import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, stroke } from '../../design/tokens';
import { selection } from '../../lib/haptics';
import { markFrom, type PlateMark, type Rect } from './plateMark';

// The picture with the plate circle drawn on it by hand: press the plate's centre, drag to its edge. `rect` is where
// the frame sits inside the box; the picture itself (a paused video) is the child. Used before tracking (MarkScreen)
// and to correct a result (plateFrames/CorrectScreen).
export default function PlateStage({
  box,
  rect,
  mark,
  onMark,
  children,
  testID,
  accessibilityLabel,
}: {
  box: { width: number; height: number };
  rect: Rect | null;
  mark: PlateMark | null;
  onMark: (mark: PlateMark) => void;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const [drag, setDrag] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const live = useRef({ rect, onMark, start: null as { x: number; y: number } | null });
  live.current.rect = rect;
  live.current.onMark = onMark;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        live.current.start = p;
        setDrag({ cx: p.x, cy: p.y, r: 0 });
      },
      onPanResponderMove: (_, g) => {
        const s = live.current.start;
        if (s) setDrag({ cx: s.x, cy: s.y, r: Math.hypot(g.dx, g.dy) });
      },
      onPanResponderRelease: (_, g) => {
        const s = live.current.start;
        const r = live.current.rect;
        live.current.start = null;
        setDrag(null);
        if (!s || !r) return;
        const next = markFrom(s, { x: s.x + g.dx, y: s.y + g.dy }, r);
        if (next) {
          selection();
          live.current.onMark(next);
        }
      },
      onPanResponderTerminate: () => {
        live.current.start = null;
        setDrag(null);
      },
    }),
  ).current;

  const shown = drag ?? (mark && rect ? { cx: rect.x + mark.x * rect.width, cy: rect.y + mark.y * rect.height, r: mark.r * rect.height } : null);

  return (
    <View {...pan.panHandlers} testID={testID} accessibilityLabel={accessibilityLabel} style={{ width: box.width, height: box.height, backgroundColor: colors.surface }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height }}>
        {children}
        {shown && shown.r > 0 ? (
          <Svg width={box.width} height={box.height} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Circle cx={shown.cx} cy={shown.cy} r={shown.r} stroke={colors.halo} strokeWidth={stroke.halo} fill="none" />
            <Circle cx={shown.cx} cy={shown.cy} r={shown.r} stroke={colors.flare} strokeWidth={stroke.path} fill="none" />
            <Circle cx={shown.cx} cy={shown.cy} r={4} fill={colors.flare} stroke={colors.halo} strokeWidth={1.5} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
