import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { fmt } from '../../analysis/format';
import { colors } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { shortDate } from './derive';

export type ChartPoint = { date: string; value: number };

const PAD = { top: 22, bottom: 22, left: 10, right: 26 };

export function chartGeometry(series: ChartPoint[], width: number, height: number, best?: number) {
  const values = series.map((p) => p.value);
  const lo = Math.min(...values, best ?? Infinity);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((hi - v) / span) * innerH;
  const x = (i: number) => (series.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i * innerW) / (series.length - 1));
  return {
    points: series.map((p, i) => ({ x: x(i), y: y(p.value), value: p.value, date: p.date })),
    bestY: best == null ? null : y(best),
  };
}

export default function TrendChart({
  series,
  width,
  height,
  best,
  markerIndex,
  markerLabel,
  markers = [],
  showDates,
  testID,
}: {
  series: ChartPoint[];
  width: number;
  height: number;
  best?: number;
  markerIndex?: number | null;
  markerLabel?: string;
  markers?: { index: number; label: string }[];
  showDates?: boolean;
  testID?: string;
}) {
  const { points, bestY } = chartGeometry(series, width, height, best);
  const last = points[points.length - 1];
  const all = [...(markerIndex != null ? [{ index: markerIndex, label: markerLabel }] : []), ...markers]
    .map((m) => ({ point: points[m.index], label: m.label }))
    .filter((m) => m.point);
  const text = { fontFamily: fontFamily.mono, fontSize: 11 };
  return (
    <View testID={testID} style={{ width, height }}>
      <Svg width={width} height={height}>
        {bestY != null ? (
          <G>
            <Line x1={0} y1={bestY} x2={width} y2={bestY} stroke={colors.text} strokeDasharray="4 6" opacity={0.35} />
            <SvgText x={width} y={bestY + 14} textAnchor="end" fill={colors.text2} {...text}>
              {`best ${fmt(best!)}`}
            </SvgText>
          </G>
        ) : null}
        {all.map(({ point, label }) => (
          <G testID="cue-marker" key={`m-${point.date}`}>
            <Line x1={point.x} y1={8} x2={point.x} y2={height - 14} stroke={colors.flare} />
            {label ? (
              <SvgText x={point.x + 4} y={height - 4} fill={colors.text2} {...text}>
                {label}
              </SvgText>
            ) : null}
          </G>
        ))}
        <Polyline
          points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          stroke={colors.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {points.slice(0, -1).map((p) => (
          <G key={p.date}>
            <Circle cx={p.x} cy={p.y} r={3} fill={colors.text} />
            <SvgText x={p.x} y={p.y - 8} textAnchor="middle" fill={colors.text2} {...text}>
              {fmt(p.value)}
            </SvgText>
          </G>
        ))}
        {last ? (
          <G>
            <Circle cx={last.x} cy={last.y} r={5} fill={colors.flare} />
            <SvgText x={last.x} y={last.y - 10} textAnchor="middle" fill={colors.flare} {...text}>
              {fmt(last.value)}
            </SvgText>
          </G>
        ) : null}
        {showDates && points.length > 1 ? (
          <G>
            <SvgText x={0} y={height - 4} fill={colors.text2} {...text}>
              {shortDate(points[0].date).toLowerCase()}
            </SvgText>
            <SvgText x={width} y={height - 4} textAnchor="end" fill={colors.text2} {...text}>
              {shortDate(last.date).toLowerCase()}
            </SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
