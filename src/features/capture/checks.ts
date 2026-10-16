import { useEffect, useState } from 'react';
import type { Movement } from '../../analysis/types';
import { t } from '../../i18n';

export type CheckId = 'whole_body' | 'side_on' | 'light';

// pass: null = no real check behind this item yet; it reads as guidance, no tick.
export type CheckResult = { id: CheckId; pass: boolean | null };

export function checkLabel(id: CheckId): string {
  if (id === 'whole_body') return t('capture.checks.label.wholeBody');
  if (id === 'side_on') return t('capture.checks.label.sideOn');
  return t('capture.checks.label.light');
}

export function checkHint(id: CheckId): string {
  if (id === 'whole_body') return t('capture.checks.hint.wholeBody');
  if (id === 'side_on') return t('capture.checks.hint.sideOn');
  return t('capture.checks.hint.light');
}

// What Review says when a check failed at the moment Record was pressed.
export function checkOverride(id: CheckId): { title: string; body: string } {
  if (id === 'whole_body') {
    return { title: t('capture.checks.override.wholeBody.title'), body: t('capture.checks.override.wholeBody.body') };
  }
  if (id === 'side_on') {
    return { title: t('capture.checks.override.sideOn.title'), body: t('capture.checks.override.sideOn.body') };
  }
  return { title: t('capture.checks.override.light.title'), body: t('capture.checks.override.light.body') };
}

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
  return id ? checkHint(id) : null;
}

export function parseChecks(param?: string): CheckId[] {
  if (!param) return [];
  return param.split(',').filter((c): c is CheckId => (CHECK_ORDER as string[]).includes(c));
}
