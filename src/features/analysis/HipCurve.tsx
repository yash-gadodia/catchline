import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { TracePoint } from '../../analysis/types';
import { pointAt } from '../../analysis/timeline';
import SmallCaps from '../../components/SmallCaps';
import { colors, space, stroke } from '../../design/tokens';
import { t } from '../../i18n';

const HEIGHT = 40;

// The hips' height over the rep, as a small bone line under the clip: up is up, the frame on screen marked in flare.
export default function HipCurve({ hips, frame, width }: { hips: TracePoint[]; frame: number; width: number }) {
  if (hips.length < 2) return null;
  const ys = hips.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const f0 = hips[0].frame;
  const f1 = hips[hips.length - 1].frame;
  const x = (f: number) => (f1 === f0 ? 0 : ((f - f0) / (f1 - f0)) * width);
  const y = (v: number) => (hi === lo ? HEIGHT / 2 : 2 + ((v - lo) / (hi - lo)) * (HEIGHT - 4));
  const now = pointAt(hips, frame);
  return (
    <View testID="hip-curve" style={{ gap: space.s1 }}>
      <SmallCaps size={11}>{t('analysis.tracks.hipHeight')}</SmallCaps>
      <Svg width={width} height={HEIGHT}>
        <Polyline points={hips.map((p) => `${x(p.frame).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')} stroke={colors.text} strokeWidth={stroke.hairline} fill="none" />
        {now ? <Circle testID="hip-curve-now" cx={x(Math.min(Math.max(frame, f0), f1))} cy={y(now.y)} r={3} fill={colors.flare} /> : null}
      </Svg>
    </View>
  );
}
