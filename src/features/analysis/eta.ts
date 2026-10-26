// How long the phone's analysis has left, from how fast its progress has moved so far:
// null until enough has happened to say (a few seconds and some progress).
export type Sample = { at: number; fraction: number };

const MIN_S = 3;
const MIN_FRACTION = 0.04;

export function etaSeconds(samples: Sample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.at - first.at) / 1000;
  const df = last.fraction - first.fraction;
  if (dt < MIN_S || df < MIN_FRACTION || last.fraction >= 1) return null;
  return Math.max(1, Math.round(((1 - last.fraction) * dt) / df));
}
