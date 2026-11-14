import { useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { seconds } from '../../analysis/format';
import { colors, shade, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { formatNumber, t } from '../../i18n';
import { pinched, ticks, type FrameWindow } from './chart';
import { speedStats } from './speed';

// room for the speed labels left of the plot, the time labels under it and the playhead's time above it
const AXIS_W = 36;
const AXIS_H = 20;
const TOP = 20;
const LABEL_W = 56;
// the least the chart needs to stay readable: the plot, its labels and the numbers under it
export const SPEED_CHART_MIN_H = 132;
// the closest zoom, in seconds of the lift
const MIN_ZOOM_S = 0.25;

const axisNumber = (v: number) => formatNumber(v, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

// Bar speed over the frames on screen (owner, 14-11: parity with WL Analysis's graph): a bone line on black with
// metres a second up the side and seconds along the bottom, the frame on screen a flare cursor with its time.
// Dragging across it scrubs the video; pinching zooms the time axis (onZoom), and the screen loops playback inside
// the frames shown. Under it, the numbers for the rep on screen. The speed is always in m/s: speed.ts gives a number
// only on frames where the plate's size was read.
export default function SpeedChart({
  at,
  frame,
  first,
  last,
  rep,
  onSeek,
  fps,
  zoom,
  onZoom,
}: {
  at: Map<number, number>;
  frame: number;
  first: number;
  last: number;
  rep: { start: number; end: number };
  onSeek: (frame: number) => void;
  // the clip's frame rate: with it the bottom axis and the cursor are labelled in seconds from `first`
  fps?: number;
  // the part of first..last on show; pinching is on when onZoom is given
  zoom?: FrameWindow | null;
  onZoom?: (zoom: FrameWindow | null) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const shownFirst = zoom ? Math.max(zoom.first, first) : first;
  const shownLast = zoom ? Math.min(zoom.last, last) : last;
  const plotW = Math.max(size.width - AXIS_W, 1);
  const plotBottom = Math.max(size.height - AXIS_H, TOP + 1);
  const live = useRef({ onSeek, onZoom, first, last, shownFirst, shownLast, plotW, fps });
  live.current = { onSeek, onZoom, first, last, shownFirst, shownLast, plotW, fps };
  // one touch: the chart's left edge on the screen. Two: the window and the fingers when the pinch began.
  const touch = useRef<{ left: number; pinch: { from: FrameWindow; anchor: number; spread: number } | null; pinchedOnce: boolean } | null>(null);

  const across = (pageX: number) => (pageX - (touch.current?.left ?? 0) - AXIS_W) / live.current.plotW;
  const seekTo = (pageX: number) => {
    const c = live.current;
    c.onSeek(c.shownFirst + Math.min(Math.max(across(pageX), 0), 1) * (c.shownLast - c.shownFirst));
  };
  const move = (e: GestureResponderEvent) => {
    const state = touch.current;
    const c = live.current;
    if (!state) return;
    const [a, b] = e.nativeEvent.touches;
    if (a && b && c.onZoom) {
      const spread = Math.max(Math.abs(a.pageX - b.pageX), 1);
      const mid = across((a.pageX + b.pageX) / 2);
      if (!state.pinch) state.pinch = { from: { first: c.shownFirst, last: c.shownLast }, anchor: mid, spread };
      state.pinchedOnce = true;
      const minSpan = Math.max(4, Math.round((c.fps ?? 30) * MIN_ZOOM_S));
      c.onZoom(pinched(state.pinch.from, state.pinch.anchor, mid, spread / state.pinch.spread, { first: c.first, last: c.last }, minSpan));
      return;
    }
    state.pinch = null;
    // the finger left on the chart after a pinch does not scrub
    if (!state.pinchedOnce) seekTo(e.nativeEvent.pageX);
  };

  const range = [...at].filter(([f]) => f >= first && f <= last).sort((a, b) => a[0] - b[0]);
  const stats = speedStats(at, Math.max(rep.start, first), Math.min(rep.end, last + 1));
  if (range.length < 2 || !stats) return null;
  // the speed axis keeps to the whole lift's range, so zooming in on the time axis does not rescale it
  const hi = Math.max(...range.map(([, v]) => v), 0.1);
  const lo = Math.min(...range.map(([, v]) => v), -0.1);
  const pad = 4;
  const x = (f: number) => AXIS_W + ((f - shownFirst) / Math.max(shownLast - shownFirst, 1)) * plotW;
  const y = (v: number) => TOP + pad + ((hi - v) / (hi - lo)) * Math.max(plotBottom - TOP - 2 * pad, 1);
  // a gap in the readings (a frame with no number) breaks the line rather than joining across it
  const shown = range.filter(([f]) => f >= shownFirst && f <= shownLast);
  let d = '';
  shown.forEach(([f, v], i) => {
    const joined = i > 0 && f - shown[i - 1][0] <= 2;
    d += `${joined ? 'L' : 'M'}${x(f).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  const now = at.get(frame) ?? at.get(frame - 1) ?? at.get(frame + 1);
  const fmt = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(2));
  const speeds = ticks(lo, hi, 3);
  const times = fps ? ticks((shownFirst - first) / fps, (shownLast - first) / fps, 4) : [];
  const timeX = (s: number) => x(first + s * (fps ?? 0));
  const onShow = frame >= shownFirst && frame <= shownLast;

  return (
    <View style={{ flex: 1, gap: space.s2 }} testID="speed-chart">
      <View
        testID="speed-plot"
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => (touch.current = { left: e.nativeEvent.pageX - e.nativeEvent.locationX, pinch: null, pinchedOnce: false })}
        onResponderMove={move}
        // a tap seeks as it lifts, not as it lands: the first finger of a pinch must not move the playhead
        onResponderRelease={(e) => {
          if (touch.current && !touch.current.pinchedOnce) seekTo(e.nativeEvent.pageX);
          touch.current = null;
        }}
        onResponderTerminate={() => (touch.current = null)}
        accessibilityRole="adjustable"
        accessibilityLabel={t('analysis.tracker.speedChart')}
        style={{ flex: 1, minHeight: SPEED_CHART_MIN_H - space.s2 - type.caption.lineHeight }}
      >
        {size.width > 0 ? (
          <>
            <Svg width={size.width} height={size.height} pointerEvents="none">
              {speeds.map((v) => (
                <Line key={`v${v}`} x1={AXIS_W} x2={size.width} y1={y(v)} y2={y(v)} stroke={v === 0 ? colors.text3 : colors.hairline} strokeWidth={stroke.hairline} />
              ))}
              {times.map((s) => (
                <Line key={`t${s}`} x1={timeX(s)} x2={timeX(s)} y1={TOP} y2={plotBottom} stroke={colors.hairline} strokeWidth={stroke.hairline} />
              ))}
              <Path testID="speed-line" d={d} stroke={colors.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
              {onShow ? <Line testID="speed-cursor" x1={x(frame)} x2={x(frame)} y1={TOP} y2={plotBottom} stroke={colors.flare} strokeWidth={stroke.hairline} /> : null}
              {onShow && now !== undefined ? <Circle testID="speed-now-dot" cx={x(frame)} cy={y(now)} r={4} fill={colors.flare} /> : null}
            </Svg>
            <Text pointerEvents="none" style={{ ...type.caption, color: colors.text3, position: 'absolute', left: 0, top: 0 }}>
              m/s
            </Text>
            {speeds.map((v, i) => (
              <Text key={`v${v}`} testID={`speed-tick-y-${i}`} pointerEvents="none" numberOfLines={1} style={{ ...type.caption, color: colors.text3, position: 'absolute', left: 0, width: AXIS_W - space.s2, top: y(v) - type.caption.lineHeight / 2, textAlign: 'right' }}>
                {axisNumber(v)}
              </Text>
            ))}
            {times.map((s, i) => (
              <Text
                key={`t${s}`}
                testID={`speed-tick-x-${i}`}
                pointerEvents="none"
                numberOfLines={1}
                style={{ ...type.caption, color: colors.text3, position: 'absolute', width: LABEL_W, left: Math.min(Math.max(timeX(s) - LABEL_W / 2, 0), size.width - LABEL_W), top: size.height - type.caption.lineHeight, textAlign: 'center' }}
              >
                {`${axisNumber(s)} s`}
              </Text>
            ))}
            {onShow && fps ? (
              <Text
                testID="speed-cursor-time"
                pointerEvents="none"
                numberOfLines={1}
                style={{ ...type.caption, color: colors.text, position: 'absolute', width: LABEL_W, left: Math.min(Math.max(x(frame) - LABEL_W / 2, AXIS_W), size.width - LABEL_W), top: 0, textAlign: 'center' }}
              >
                {`${seconds((frame - first) / fps)} s`}
              </Text>
            ) : null}
          </>
        ) : null}
        {zoom && onZoom ? (
          <Pressable
            testID="speed-zoom-reset"
            accessibilityRole="button"
            onPress={() => onZoom(null)}
            hitSlop={8}
            style={{ position: 'absolute', right: 0, top: TOP + space.s1, height: space.s6, paddingHorizontal: space.s2, justifyContent: 'center', backgroundColor: shade(0.6), borderWidth: stroke.hairline, borderColor: colors.text, ...shape.control }}
          >
            <Text style={{ ...type.caption, color: colors.text }}>{t('analysis.tracker.zoomReset')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text testID="speed-stats" numberOfLines={1} adjustsFontSizeToFit style={{ ...type.caption, color: colors.text2 }}>
        {t('analysis.tracker.speedStats', { now: fmt(now), avg: fmt(stats.avgUp), min: fmt(stats.min), max: fmt(stats.max) })}
      </Text>
    </View>
  );
}
