import PoseCoreML, { type PoseResult } from '../../modules/pose-coreml';

// Off unless EXPO_PUBLIC_ON_DEVICE_POSE=1, and only where the native module exists (iOS).
export function onDevicePoseEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ON_DEVICE_POSE === '1' && PoseCoreML !== null;
}

// The object uploaded next to the clip as '<user>/<lift>.pose.json'. The native side
// already rounds (0.1 px, 0.001 score) and drops head points; the worker reads it
// with cv/catchline_cv/external_pose.py.
export function poseJson(r: PoseResult): string {
  return JSON.stringify({ source: 'rtmpose-coreml', ...r });
}

// Body pose for the prepared clip, as the JSON to upload, or null when the flag is
// off or the models fail (the server then runs its own pose model).
export async function analyzeClipPose(uri: string, onProgress: (p: number) => void): Promise<string | null> {
  if (!onDevicePoseEnabled() || PoseCoreML === null) return null;
  const sub = PoseCoreML.addListener('onProgress', (e) => onProgress(e.progress));
  try {
    return poseJson(await PoseCoreML.analyzePose(uri));
  } catch {
    return null;
  } finally {
    sub.remove();
  }
}
