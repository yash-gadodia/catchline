import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Analysis, Rep } from '../../analysis/types';
import { toScreen, type Size } from '../../analysis/geometry';
import { fmt } from '../../analysis/format';
import { liftPath, pathUpTo, pointAt } from '../../analysis/timeline';
import { space } from '../../design/tokens';
import { t } from '../../i18n';
import HipCurve from './HipCurve';
import Stage from './Stage';
import TrackLegend, { ALL_TRACKS, type TrackKey, type TrackVisibility } from './TrackLegend';
import { FeetMarks, FlarePath, Guides, OverlaySvg, RefLine, TrackPath } from './overlays';

const STEP_MS = 450;
const HOLD_STEPS = 3;

// The feet's shift from lift-off to the catch as the mark's label, when the result measured it.
function feetLabel(analysis: Analysis): string | undefined {
  const m = analysis.measurements.find((x) => x.id === 'jump_forward');
  if (!m || m.status === 'not_seen' || !(analysis.keyNumbers ?? []).includes('jump_forward')) return undefined;
  return t(m.value < 0 ? 'analysis.key.feetBack' : 'analysis.key.feetForward', { cm: fmt(Math.abs(m.value)) });
}

// The result's hero: the rep's key frames in a loop with the bar path drawing over them, on the coaching guides, and
// the joint tracks (hips, shoulders, feet) when the analysis has them, each one a tap away from hidden.
// Reduced motion holds the last frame with the whole path.
export default function PathReplay({
  analysis,
  rep,
  box,
  dashed,
  pathTestID,
  reduceMotion,
}: {
  analysis: Analysis;
  rep: Rep;
  box: Size;
  dashed?: boolean;
  pathTestID?: string;
  reduceMotion?: boolean;
}) {
  const systemReduce = useReducedMotion();
  const still = reduceMotion ?? systemReduce;
  const keys = rep.keyFrames;
  const last = keys.length - 1;
  const [step, setStep] = useState(still ? last : 0);
  const [visible, setVisible] = useState<TrackVisibility>(ALL_TRACKS);
  useEffect(() => {
    if (still || last < 1) return;
    const id = setInterval(() => setStep((n) => (n + 1) % (last + 1 + HOLD_STEPS)), STEP_MS);
    return () => clearInterval(id);
  }, [still, last]);
  const key = keys[Math.min(step, last)];
  const src = { width: analysis.video.width, height: analysis.video.height };
  const g = rep.guides;
  const pathOnly = analysis.noCueReason?.code === 'path_only';
  // the ring once the replay reaches it, and on the held last frame either way (a path-only peak still can sit before it)
  const ring = !!g && ((analysis.keyNumbers ?? []).includes('max_forward_drift') || pathOnly) && (key.frame >= g.ring.frame || step >= last);
  const full = liftPath(rep);
  const tracks = rep.tracks ?? {};
  const legend: TrackKey[] = [...(tracks.hips ? ['hips' as const] : []), ...(tracks.shoulders ? ['shoulders' as const] : []), ...(tracks.feet ? ['feet' as const] : [])];
  const feet = tracks.feet ?? [];
  // the landing is the catch where the rep has one, else the end of the track
  const catchFrame = rep.keyFrames.find((k) => k.phase === 'catch')?.frame;
  const landed = feet.length ? (catchFrame == null ? feet[feet.length - 1] : pointAt(feet, catchFrame)) : null;
  const label = feetLabel(analysis);
  return (
    <View testID="path-replay">
      <Stage src={src} box={box} focus={{ x: 0.5, y: 0.45 }} layers={[{ image: key.image }]}>
        {(fit) => {
          const s = (p: { x: number; y: number }) => toScreen(p, fit);
          return (
            <OverlaySvg box={box}>
              {g && Number.isFinite(g.startX) ? <RefLine x={s({ x: g.startX, y: 0 }).x} top={box.height * 0.08} bottom={box.height * 0.94} alpha={0.4} /> : null}
              {g ? <Guides guides={g} toScreen={s} box={box} ring={ring} /> : null}
              {visible.shoulders && tracks.shoulders ? <TrackPath points={tracks.shoulders.map(s)} kind="shoulders" testID="track-shoulders" /> : null}
              {visible.hips && tracks.hips ? <TrackPath points={tracks.hips.map(s)} kind="hips" testID="track-hips" /> : null}
              {visible.feet && landed ? <FeetMarks start={s(feet[0])} end={s(landed)} label={label} testID="feet-marks" /> : null}
              {visible.bar ? <FlarePath points={full.map(s)} dashed={dashed} faint={step < last} testID={pathTestID} /> : null}
              {visible.bar && step < last ? <FlarePath points={pathUpTo(full, key.frame).map(s)} dashed={dashed} testID="replay-drawn" /> : null}
            </OverlaySvg>
          );
        }}
      </Stage>
      {legend.length ? <TrackLegend keys={['bar', ...legend]} visible={visible} onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))} /> : null}
      {visible.hips && tracks.hips ? (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s3 }}>
          <HipCurve hips={tracks.hips} frame={key.frame} width={Math.max(0, box.width - 2 * space.gutter)} />
        </View>
      ) : null}
    </View>
  );
}
