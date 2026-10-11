import { useRef, useState } from 'react';
import { Image, PanResponder, Text, View, type ImageSourcePropType } from 'react-native';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { moveHandle, timeToX, trimClock, trimLength, xToTime, type Trim } from './trim';

type Handle = 'start' | 'end';

const HANDLE_W = 14;
const STRIP_H = 64;

export default function Trimmer({
  durationS,
  trim,
  thumbs,
  label,
  onChange,
  onDrag,
}: {
  durationS: number;
  trim: Trim;
  thumbs: (ImageSourcePropType | null)[];
  label: string;
  onChange: (t: Trim) => void;
  onDrag?: (handle: Handle | null, t: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ trim, width, durationS, onChange, onDrag });
  latest.current = { trim, width, durationS, onChange, onDrag };

  const responder = (handle: Handle) => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const l = latest.current;
        startX = timeToX(l.trim[handle], l.durationS, l.width);
        l.onDrag?.(handle, l.trim[handle]);
      },
      onPanResponderMove: (_e, g) => {
        const l = latest.current;
        const next = moveHandle(l.trim, handle, xToTime(startX + g.dx, l.durationS, l.width), l.durationS);
        l.onChange(next);
        l.onDrag?.(handle, next[handle]);
      },
      onPanResponderRelease: () => latest.current.onDrag?.(null, 0),
      onPanResponderTerminate: () => latest.current.onDrag?.(null, 0),
    });
  };
  const start = useRef(responder('start')).current;
  const end = useRef(responder('end')).current;

  const left = timeToX(trim.start, durationS, width);
  const right = timeToX(trim.end, durationS, width);
  return (
    <View style={{ gap: space.s3 }} testID="trimmer">
      <View
        style={{ height: STRIP_H, flexDirection: 'row', gap: 2 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {thumbs.map((src, i) => {
          const mid = ((i + 0.5) / thumbs.length) * durationS;
          const inside = mid >= trim.start && mid <= trim.end;
          return (
            <View key={i} style={{ flex: 1, backgroundColor: colors.surface2, overflow: 'hidden' }}>
              {src ? (
                <Image source={src} resizeMode="cover" style={{ width: '100%', height: '100%', opacity: inside ? 1 : 0.4 }} />
              ) : null}
            </View>
          );
        })}
        {width > 0 ? (
          <>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left, width: right - left, top: 0, bottom: 0, borderWidth: 3, borderColor: colors.flare }}
            />
            <Grip x={left - HANDLE_W / 2} handlers={start.panHandlers} testID="trim-start" />
            <Grip x={right - HANDLE_W / 2} handlers={end.panHandlers} testID="trim-end" />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Mono testID="trim-start-time">{trimClock(trim.start)}</Mono>
        <Mono testID="trim-length">{`${trimLength(trim).toFixed(1)} s${label ? ` · ${label}` : ''}`}</Mono>
        <Mono testID="trim-end-time">{trimClock(trim.end)}</Mono>
      </View>
    </View>
  );
}

function Grip({ x, handlers, testID }: { x: number; handlers: object; testID: string }) {
  return (
    <View
      {...handlers}
      testID={testID}
      accessibilityRole="adjustable"
      hitSlop={{ left: 16, right: 16, top: 8, bottom: 8 }}
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        bottom: 0,
        width: HANDLE_W,
        backgroundColor: colors.flare,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 2, height: 20, backgroundColor: colors.onFlare }} />
    </View>
  );
}

function Mono({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
      {children}
    </Text>
  );
}
