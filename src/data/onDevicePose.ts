import type { PoseResult } from '../../modules/pose-coreml';

// The native pose result as JSON (the dev pose route shows it). The native side already
// rounds (0.1 px, 0.001 score) and drops head points.
export function poseJson(r: PoseResult): string {
  return JSON.stringify({ source: 'rtmpose-coreml', ...r });
}
