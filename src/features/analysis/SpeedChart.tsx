import { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { speedStats } from './speed';

// Bar speed over the frames on screen (owner, 14-11: parity with WL Analysis's graph): a bone line on black, the zero
// line a hairline, the frame on screen a flare dot. Dragging across it scrubs the video. Under it, the numbers for
// the rep on screen.
export default function SpeedChart({
  at,
  frame,
  first,
  last,
  rep,
  onSeek,
}: {
  at: Map<number, number>;
  frame: number;
  first: number;
  last: number;
  rep: { start: number; end: number };
  onSeek: (frame: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const live = useRef({ onSeek, first, last, width: 0 });
  live.current = { onSeek, first, last, width: size.width };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => seekTo(e.nativeEvent.locationX),
      onPanResponderMove: (e) => seekTo(e.nativeEvent.locationX),
    }),
  ).current;
  function seekTo(x: number) {
    const { onSeek: seek, first: f, last: l, width } = live.current;
    if (width > 0) seek(f + (Math.min(Math.max(x, 0), width) / width) * (l - f));
  }

  const shown = [...at].filter(([f]) => f >= first && f <= last).sort((a, b) => a[0] - b[0]);
  const stats = speedStats(at, Math.max(rep.start, first), Math.min(rep.end, last + 1));
  if (shown.length < 2 || !stats) return null;
  const hi = Math.max(...shown.map(([, v]) => v), 0.1);
  const lo = Math.min(...shown.map(([, v]) => v), -0.1);
  const pad = 4;
  const x = (f: number) => ((f - first) / Math.max(last - first, 1)) * size.width;
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * Math.max(size.height - 2 * pad, 1);
  // a gap in the readings (a frame with no number) breaks the line rather than joining across it
  let d = '';
  shown.forEach(([f, v], i) => {
    const joined = i > 0 && f - shown[i - 1][0] <= 2;
    d += `${joined ? 'L' : 'M'}${x(f).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  const now = at.get(frame) ?? at.get(frame - 1) ?? at.get(frame + 1);
  const fmt = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(2));

  return (
    <View style={{ flex: 1, gap: space.s2 }} testID="speed-chart">
      <View
        {...pan.panHandlers}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        accessibilityRole="adjustable"
        accessibilityLabel={t('analysis.tracker.speedChart')}
        style={{ flex: 1, minHeight: space.s6 }}
      >
        {size.width > 0 ? (
          <Svg width={size.width} height={size.height}>
            <Line x1={0} x2={size.width} y1={y(0)} y2={y(0)} stroke={colors.hairline} strokeWidth={stroke.hairline} />
            <Line x1={x(frame)} x2={x(frame)} y1={0} y2={size.height} stroke={colors.hairline} strokeWidth={stroke.hairline} />
            <Path d={d} stroke={colors.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            {now !== undefined ? <Circle testID="speed-now-dot" cx={x(frame)} cy={y(now)} r={4} fill={colors.flare} /> : null}
          </Svg>
        ) : null}
      </View>
      <Text testID="speed-stats" numberOfLines={1} adjustsFontSizeToFit style={{ ...type.caption, color: colors.text2 }}>
        {t('analysis.tracker.speedStats', { now: fmt(now), avg: fmt(stats.avgUp), min: fmt(stats.min), max: fmt(stats.max) })}
      </Text>
    </View>
  );
}
