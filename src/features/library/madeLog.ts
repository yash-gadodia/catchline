import type { Analysis } from '../../analysis/types';
import { repByIndex } from '../../analysis/timeline';

// The detected made/missed outcome synced with a lift. A path-only result has no catch to judge.
export function detectedMade(a: Analysis): boolean | null {
  return a.failure || a.reps.length === 0 || a.noCueReason?.code === 'path_only' ? null : repByIndex(a, a.bestRepIndex).made;
}
