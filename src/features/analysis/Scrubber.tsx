import { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import type { Rep } from '../../analysis/types';
import { frameAtProgress, phaseTicks, progressOf } from '../../analysis/timeline';
import { colors } from '../../design/tokens';
import { fontFamily } from '../../design/typography';

export default function Scrubber({
  rep,
  frame,
  label,
  onFrame,
  onScrubbing,
}: {
  rep: Rep;
  frame: number;
  label: string;
  onFrame: (f: number) => void;
  onScrubbing: (on: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const track = useRef<View>(null);
  const left = useRef(0);
  const latest = useRef({ width, onFrame, onScrubbing, rep });
  latest.current = { width, onFrame, onScrubbing, rep };

  const seek = (pageX: number) => {
    const { width: w, rep: r, onFrame: cb } = latest.current;
    if (w > 0) cb(frameAtProgress(r, (pageX - left.current) / w));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setActive(true);
        latest.current.onScrubbing(true);
        seek(e.nativeEvent.pageX);
      },
      onPanResponderMove: (e) => seek(e.nativeEvent.pageX),
      onPanResponderRelease: () => {
        setActive(false);
        latest.current.onScrubbing(false);
      },
      onPanResponderTerminate: () => {
        setActive(false);
        latest.current.onScrubbing(false);
      },
    })
  ).current;

  const p = progressOf(rep, frame);
  const thumb = active ? 18 : 12;
  return (
    <View
      testID="scrubber"
      {...pan.panHandlers}
      style={{ height: 32, justifyContent: 'center', flex: 1 }}
      hitSlop={{ top: 12, bottom: 12 }}
    >
      <View
        ref={track}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
          track.current?.measureInWindow((x) => {
            left.current = x;
          });
        }}
        style={{ height: 2, backgroundColor: colors.hairline }}
      >
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: p * width, backgroundColor: colors.text }} />
        {phaseTicks(rep).map((t, i) => (
          <View
            key={i}
            testID="phase-tick"
            style={{ position: 'absolute', left: t * width, top: -3, width: 1, height: 8, backgroundColor: colors.text3 }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: p * width - thumb / 2,
            top: 1 - thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            backgroundColor: colors.text,
          }}
        />
        {active ? (
          <View
            testID="scrub-label"
            style={{
              position: 'absolute',
              bottom: 22,
              left: Math.max(0, Math.min(width - 130, p * width - 65)),
              width: 130,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: colors.bg,
                backgroundColor: colors.text,
                paddingHorizontal: 8,
                paddingVertical: 4,
                fontFamily: fontFamily.mono,
                fontSize: 12,
                lineHeight: 16,
              }}
            >
              {label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
