import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { lightTick } from '../../lib/haptics';
import type { Thumb } from './ClipPlayer';
import { atLimit, clampToTrim, moveHandle, NUDGE_S, nudgeHandle, playheadAt, slideTrim, timeToX, trimClock, trimLength, xToTime, type Trim } from './trim';
import { t } from '../../i18n';

type Handle = 'start' | 'end';

const HANDLE_W = 14;
const STRIP_H = 64;
const HEAD_HIT = 24;

export default function Trimmer({
  durationS,
  trim,
  thumbs,
  label,
  head,
  onChange,
  onHead,
  onDrag,
}: {
  durationS: number;
  trim: Trim;
  thumbs: Thumb[];
  label: string;
  head: number;
  onChange: (t: Trim) => void;
  onHead: (t: number) => void;
  onDrag?: (handle: Handle | null, t: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ trim, width, durationS, head, onChange, onHead, onDrag });
  latest.current = { trim, width, durationS, head, onChange, onHead, onDrag };

  const responder = (handle: Handle) => {
    let startX = 0;
    let limit = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const l = latest.current;
        startX = timeToX(l.trim[handle], l.durationS, l.width);
        limit = atLimit(l.trim, handle, l.durationS);
        l.onDrag?.(handle, l.trim[handle]);
      },
      onPanResponderMove: (_e, g) => {
        const l = latest.current;
        const next = moveHandle(l.trim, handle, xToTime(startX + g.dx, l.durationS, l.width), l.durationS);
        const hit = atLimit(next, handle, l.durationS);
        if (hit && !limit) lightTick();
        limit = hit;
        l.onChange(next);
        l.onDrag?.(handle, next[handle]);
      },
      onPanResponderRelease: () => latest.current.onDrag?.(null, 0),
      onPanResponderTerminate: () => latest.current.onDrag?.(null, 0),
    });
  };
  const start = useRef(responder('start')).current;
  const end = useRef(responder('end')).current;
  const slide = useRef(
    (() => {
      let from: Trim = trim;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          from = latest.current.trim;
          latest.current.onDrag?.('start', from.start);
        },
        onPanResponderMove: (_e, g) => {
          const l = latest.current;
          const next = slideTrim(from, l.width > 0 ? (g.dx / l.width) * l.durationS : 0, l.durationS);
          l.onChange(next);
          l.onDrag?.('start', next.start);
        },
        onPanResponderRelease: () => latest.current.onDrag?.(null, 0),
        onPanResponderTerminate: () => latest.current.onDrag?.(null, 0),
      });
    })()
  ).current;
  const playhead = useRef(
    (() => {
      let startX = 0;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const l = latest.current;
          startX = timeToX(l.head, l.durationS, l.width);
          l.onHead(l.head);
        },
        onPanResponderMove: (_e, g) => {
          const l = latest.current;
          l.onHead(playheadAt(startX + g.dx, l.trim, l.durationS, l.width));
        },
      });
    })()
  ).current;
  const nudge = (handle: Handle, direction: 1 | -1) => onChange(nudgeHandle(trim, handle, direction, durationS));

  const left = timeToX(trim.start, durationS, width);
  const right = timeToX(trim.end, durationS, width);
  const headX = timeToX(head, durationS, width);
  return (
    <View style={{ gap: space.s3 }} testID="trimmer">
      <Text testID="trim-head-time" style={{ color: colors.text, ...type.readout, textAlign: 'center' }}>
        {trimClock(head)}
      </Text>
      <View
        style={{ height: STRIP_H, flexDirection: 'row', gap: 2 }}
        testID="trim-strip"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {thumbs.map((src, i) => {
          const mid = ((i + 0.5) / thumbs.length) * durationS;
          const inside = mid >= trim.start && mid <= trim.end;
          return (
            <View key={i} style={{ flex: 1, backgroundColor: colors.surface2, overflow: 'hidden' }}>
              {src ? (
                <Image source={src} contentFit="cover" testID="trim-thumb" style={{ width: '100%', height: '100%', opacity: inside ? 1 : 0.4 }} />
              ) : null}
            </View>
          );
        })}
        {width > 0 ? (
          <>
            <View
              {...slide.panHandlers}
              testID="trim-window"
              accessibilityLabel={t('capture.trim.window')}
              style={{ position: 'absolute', left, width: right - left, top: 0, bottom: 0, borderWidth: 3, borderColor: colors.flare }}
            />
            <View
              {...playhead.panHandlers}
              testID="trim-playhead"
              accessibilityRole="adjustable"
              accessibilityLabel={t('capture.trim.playhead')}
              accessibilityValue={{ text: trimClock(head) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => onHead(clampToTrim(head + (e.nativeEvent.actionName === 'increment' ? NUDGE_S : -NUDGE_S), trim))}
              style={{ position: 'absolute', left: headX - HEAD_HIT / 2, width: HEAD_HIT, top: -space.s1, bottom: -space.s1, alignItems: 'center' }}
            >
              <View style={{ width: 2, flex: 1, backgroundColor: colors.text }} />
            </View>
            <Grip x={left - HANDLE_W / 2} handlers={start.panHandlers} label={t('capture.trim.startLabel')} value={trimClock(trim.start)} onNudge={(d) => nudge('start', d)} testID="trim-start" />
            <Grip x={right - HANDLE_W / 2} handlers={end.panHandlers} label={t('capture.trim.endLabel')} value={trimClock(trim.end)} onNudge={(d) => nudge('end', d)} testID="trim-end" />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Stepper onNudge={(d) => nudge('start', d)} testID="trim-start">
          <Mono testID="trim-start-time">{trimClock(trim.start)}</Mono>
        </Stepper>
        <Mono testID="trim-length">{`${trimLength(trim).toFixed(1)} s${label ? ` · ${label}` : ''}`}</Mono>
        <Stepper onNudge={(d) => nudge('end', d)} testID="trim-end">
          <Mono testID="trim-end-time">{trimClock(trim.end)}</Mono>
        </Stepper>
      </View>
    </View>
  );
}

function Grip({
  x,
  handlers,
  label,
  value,
  onNudge,
  testID,
}: {
  x: number;
  handlers: object;
  label: string;
  value: string;
  onNudge: (direction: 1 | -1) => void;
  testID: string;
}) {
  return (
    <View
      {...handlers}
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onNudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
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

// ‹ and › step a handle a tenth of a second, for the frame the lift starts on.
function Stepper({ children, onNudge, testID }: { children: ReactNode; onNudge: (direction: 1 | -1) => void; testID: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
      <Arrow onPress={() => onNudge(-1)} label={t('capture.trim.earlier')} testID={`${testID}-earlier`}>‹</Arrow>
      {children}
      <Arrow onPress={() => onNudge(1)} label={t('capture.trim.later')} testID={`${testID}-later`}>›</Arrow>
    </View>
  );
}

function Arrow({ children, onPress, label, testID }: { children: string; onPress: () => void; label: string; testID: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Text style={{ color: colors.text, ...type.label }}>{children}</Text>
    </Pressable>
  );
}

function Mono({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} style={{ color: colors.text2, ...type.readout }}>
      {children}
    </Text>
  );
}
