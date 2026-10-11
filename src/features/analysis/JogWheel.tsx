import { useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors, radius } from '../../design/tokens';

export const JOG_STEP_PX = 8;

// Drag to step frames (one per 8px); tap a half to jump to the previous or
// next keyframe.
export default function JogWheel({
  onStep,
  onKeyStep,
}: {
  onStep: (frames: number) => void;
  onKeyStep: (dir: 1 | -1) => void;
}) {
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const handlers = useRef({ onStep, onKeyStep, width });
  handlers.current = { onStep, onKeyStep, width };
  const consumed = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        consumed.current = 0;
      },
      onPanResponderMove: (_, g) => {
        const steps = Math.trunc(-g.dx / JOG_STEP_PX);
        if (steps !== consumed.current) {
          handlers.current.onStep(steps - consumed.current);
          consumed.current = steps;
        }
        setOffset(((g.dx % JOG_STEP_PX) + JOG_STEP_PX) % JOG_STEP_PX);
      },
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dx) < 4) {
          handlers.current.onKeyStep(e.nativeEvent.locationX < handlers.current.width / 2 ? -1 : 1);
        }
        setOffset(0);
      },
    })
  ).current;

  const count = Math.ceil(width / JOG_STEP_PX) + 1;
  return (
    <View
      testID="jog-wheel"
      {...pan.panHandlers}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flex: 1, height: 40, borderRadius: radius.control, overflow: 'hidden', marginHorizontal: 16 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * JOG_STEP_PX + offset - JOG_STEP_PX,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: colors.hairline,
          }}
        />
      ))}
      <View style={{ position: 'absolute', left: width / 2 - 1, top: 0, bottom: 0, width: 2, backgroundColor: colors.flare }} />
    </View>
  );
}
