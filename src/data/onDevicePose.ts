import PoseVision, { type Joints, type PoseResult } from '../../modules/pose-vision';

const MIN_CONF = 0.1;

// Off unless EXPO_PUBLIC_ON_DEVICE_POSE=1, and only where the native module exists (iOS).
export function onDevicePoseEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ON_DEVICE_POSE === '1' && PoseVision !== null;
}

function compactJoints(joints: Joints): Joints {
  const out: Joints = {};
  for (const [name, [x, y, c]] of Object.entries(joints)) {
    if (c >= MIN_CONF) out[name] = [Math.round(x), Math.round(y), Math.round(c * 100) / 100];
  }
  return out;
}

// The object uploaded next to the clip as '<user>/<lift>.pose.json': whole pixels,
// two-decimal confidence, joints under 0.1 dropped. The worker reads it with
// cv/catchline_cv/external_pose.py.
export function compactPose(r: PoseResult): string {
  return JSON.stringify({
    source: 'apple-vision',
    fps: r.fps,
    width: Math.round(r.width),
    height: Math.round(r.height),
    ...(r.bodyAngleDeg !== undefined ? { bodyAngleDeg: Math.round(r.bodyAngleDeg) } : {}),
    frames: r.frames.map((f) => ({
      t: Math.round(f.t * 10000) / 10000,
      joints: compactJoints(f.joints),
      ...(f.box ? { box: f.box.map(Math.round) } : {}),
      ...(f.others?.length ? { others: f.others.map((o) => ({ box: o.box.map(Math.round), joints: compactJoints(o.joints) })) } : {}),
    })),
  });
}

// Body pose for the prepared clip, as the compact JSON to upload, or null when the
// flag is off or Vision fails (the server then runs its own pose model).
export async function analyzeClipPose(uri: string, onProgress: (p: number) => void): Promise<string | null> {
  if (!onDevicePoseEnabled() || PoseVision === null) return null;
  const sub = PoseVision.addListener('onProgress', (e) => onProgress(e.progress));
  try {
    return compactPose(await PoseVision.analyzePose(uri, {}));
  } catch {
    return null;
  } finally {
    sub.remove();
  }
}
