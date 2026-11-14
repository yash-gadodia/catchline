import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, opacity, shade, shape, stroke } from '../../design/tokens';
import { display } from '../../design/typography';
import type { TrackSpec } from './trackShare';

// What the shared video carries under the lockup, drawn the way TrackRenderer drawDetails burns it in: the lifter's
// own line (date, weight) and the bar speed graph with the speed on this frame. `unit` is the mark size in points and
// `width` the lockup's, so the column lines up.
export default function ShareDetails({ unit: u, width, caption, chart, frame, first, last }: { unit: number; width: number; caption: string | null; chart?: TrackSpec['chart']; frame: number; first: number; last: number }) {
  const pad = u * 0.45;
  const plate = { backgroundColor: shade(0.82), ...shape.control };
  const plotH = u * 2.2;
  const plotW = Math.max(width - pad * 2, 1);
  const now = chart?.values.find(([f]) => f === frame)?.[1];
  const at = (f: number, v: number) => {
    const x = ((Math.min(Math.max(f, first), last) - first) / Math.max(last - first, 1)) * plotW;
    const y = chart ? plotH - ((v - chart.min) / (chart.max - chart.min)) * plotH : 0;
    return { x, y };
  };
  const line = (pts: [number, number][]) => pts.map(([f, v], i) => `${i ? 'L' : 'M'}${at(f, v).x.toFixed(1)} ${at(f, v).y.toFixed(1)}`).join(' ');
  const shown = chart ? chart.values.filter(([f]) => f >= first && f <= last) : [];
  const text = [display(u * 0.82), { color: colors.text }];
  return (
    <View pointerEvents="none" style={{ gap: u * 0.2, alignItems: 'flex-start' }}>
      {caption ? (
        <View testID="share-caption" style={{ ...plate, minWidth: width, paddingHorizontal: pad, paddingVertical: pad * 0.5 }}>
          <Text numberOfLines={1} style={text}>
            {caption}
          </Text>
        </View>
      ) : null}
      {chart && chart.max > chart.min && shown.length > 1 ? (
        <View testID="share-graph" style={{ ...plate, width, padding: pad, gap: pad * 0.4 }}>
          <Text testID="share-graph-now" numberOfLines={1} style={text}>
            {`${now === undefined ? '–' : now.toFixed(2)} ${chart.unit}`}
          </Text>
          <Svg width={plotW} height={plotH}>
            {chart.min < 0 && chart.max > 0 ? <Line x1={0} x2={plotW} y1={at(first, 0).y} y2={at(first, 0).y} stroke={colors.text} strokeWidth={stroke.hairline} opacity={opacity.lines} /> : null}
            <Path d={line(shown)} stroke={colors.text} strokeWidth={1.5} opacity={opacity.lines} fill="none" strokeLinejoin="round" />
            {shown.filter(([f]) => f <= frame).length > 1 ? <Path d={line(shown.filter(([f]) => f <= frame))} stroke={colors.text} strokeWidth={1.5} fill="none" strokeLinejoin="round" /> : null}
            <Line x1={at(frame, 0).x} x2={at(frame, 0).x} y1={0} y2={plotH} stroke={colors.flare} strokeWidth={stroke.hairline} />
            {now !== undefined ? <Circle cx={at(frame, now).x} cy={at(frame, now).y} r={u * 0.16} fill={colors.flare} /> : null}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
