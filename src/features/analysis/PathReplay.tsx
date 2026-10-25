import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Analysis, Rep } from '../../analysis/types';
import { toScreen, type Size } from '../../analysis/geometry';
import { liftPath, pathUpTo } from '../../analysis/timeline';
import Stage from './Stage';
import { FlarePath, Guides, OverlaySvg, RefLine } from './overlays';

const STEP_MS = 450;
const HOLD_STEPS = 3;

// The result's hero: the rep's key frames in a loop with the bar path drawing over them, on the coaching guides.
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
  useEffect(() => {
    if (still || last < 1) return;
    const id = setInterval(() => setStep((n) => (n + 1) % (last + 1 + HOLD_STEPS)), STEP_MS);
    return () => clearInterval(id);
  }, [still, last]);
  const key = keys[Math.min(step, last)];
  const src = { width: analysis.video.width, height: analysis.video.height };
  const g = rep.guides;
  const ring = !!g && (analysis.keyNumbers ?? []).includes('max_forward_drift') && key.frame >= g.ring.frame;
  const full = liftPath(rep);
  return (
    <View testID="path-replay">
      <Stage src={src} box={box} focus={{ x: 0.5, y: 0.45 }} layers={[{ image: key.image }]}>
        {(fit) => {
          const s = (p: { x: number; y: number }) => toScreen(p, fit);
          return (
            <OverlaySvg box={box}>
              {g && Number.isFinite(g.startX) ? <RefLine x={s({ x: g.startX, y: 0 }).x} top={box.height * 0.08} bottom={box.height * 0.94} alpha={0.4} /> : null}
              {g ? <Guides guides={g} toScreen={s} box={box} ring={ring} /> : null}
              <FlarePath points={full.map(s)} dashed={dashed} faint={step < last} testID={pathTestID} />
              {step < last ? <FlarePath points={pathUpTo(full, key.frame).map(s)} dashed={dashed} testID="replay-drawn" /> : null}
            </OverlaySvg>
          );
        }}
      </Stage>
    </View>
  );
}
