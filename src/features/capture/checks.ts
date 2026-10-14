import { useEffect, useState } from 'react';
import type { Movement } from '../../analysis/types';

export type CheckId = 'whole_body' | 'side_on' | 'light';

// pass: null = no real check behind this item yet; it reads as guidance, no tick.
export type CheckResult = { id: CheckId; pass: boolean | null };

export const CHECK_LABEL: Record<CheckId, string> = {
  whole_body: 'Whole body in frame',
  side_on: 'Film from the side',
  light: 'Good light',
};

export const CHECK_HINT: Record<CheckId, string> = {
  whole_body: 'Feet are cut off. Move the phone back or tilt it down.',
  side_on: 'Turn the phone so you film from the side, not the front.',
  light: "It's too dark to see the bar. Face a light or move closer to one.",
};

// What Review says when a check failed at the moment Record was pressed.
export const CHECK_OVERRIDE: Record<CheckId, { title: string; body: string }> = {
  whole_body: {
    title: 'Feet were out of frame',
    body: 'We can still measure the bar. Foot position and catch depth will be missing.',
  },
  side_on: {
    title: 'Filmed at an angle',
    body: 'Forward and back distances will read short. The timing is still good.',
  },
  light: {
    title: 'The clip was dark',
    body: 'We may lose the bar in places. Anything we can’t see we won’t measure.',
  },
};

export const CHECK_ORDER: CheckId[] = ['whole_body', 'side_on', 'light'];

// A live framing checker. The viewfinder subscribes while the camera is open;
// results arrive as often as the checker likes. The real implementation will run
// on-device pose on camera frames (needs a frame-processor camera, see camera/).
export interface FramingChecker {
  start(movement: Movement, onResults: (results: CheckResult[]) => void): () => void;
}

// TODO(on-device pose): replace with a frame-processor checker. Until then no
// item claims a result: three ticks on a laptop pointed at a desk is a lie.
export const stubChecker: FramingChecker = {
  start(_movement, onResults) {
    onResults(CHECK_ORDER.map((id) => ({ id, pass: null })));
    return () => {};
  },
};

// Fixed results, for dev deep links and tests.
export function fixedChecker(failing: CheckId[]): FramingChecker {
  return {
    start(_movement, onResults) {
      onResults(CHECK_ORDER.map((id) => ({ id, pass: !failing.includes(id) })));
      return () => {};
    },
  };
}

export function useFramingChecks(checker: FramingChecker, movement: Movement, active = true): CheckResult[] {
  const [results, setResults] = useState<CheckResult[]>([]);
  useEffect(() => {
    if (!active) return;
    return checker.start(movement, setResults);
  }, [checker, movement, active]);
  return results;
}

export function failing(results: CheckResult[]): CheckId[] {
  return results.filter((r) => r.pass === false).map((r) => r.id);
}

export function firstHint(results: CheckResult[]): string | null {
  const id = CHECK_ORDER.find((c) => results.some((r) => r.id === c && r.pass === false));
  return id ? CHECK_HINT[id] : null;
}

export function parseChecks(param?: string): CheckId[] {
  if (!param) return [];
  return param.split(',').filter((c): c is CheckId => (CHECK_ORDER as string[]).includes(c));
}
