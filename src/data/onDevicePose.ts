import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import PoseCoreML, { type PoseResult } from '../../modules/pose-coreml';
import { supabase } from '../lib/supabase';

// v2 (18 Oct): v1 also latched when the lifter hid the app mid-model, which left phones on the
// slow server pose for good; the new keys start every phone fresh.
export const POSE_ATTEMPT_KEY = 'catchline-pose-attempt-v2';
export const POSE_DISABLED_KEY = 'catchline-pose-disabled-v2';
const SERVER_SWITCH = 'on_device_pose';

// Off unless EXPO_PUBLIC_ON_DEVICE_POSE=1, and only where the native module exists (iOS).
export function onDevicePoseEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ON_DEVICE_POSE === '1' && PoseCoreML !== null;
}

// Starts the one-time model download (~150 MB) so a later lift can run pose on the phone;
// the framing check uses the same models, so this does not wait for the build flag.
export function prefetchPoseModels(): void {
  PoseCoreML?.ensureModels().catch(() => undefined);
}

// The object uploaded next to the clip as '<user>/<lift>.pose.json'. The native side
// already rounds (0.1 px, 0.001 score) and drops head points; the worker reads it
// with cv/catchline_cv/external_pose.py.
export function poseJson(r: PoseResult): string {
  return JSON.stringify({ source: 'rtmpose-coreml', ...r });
}

// The build flag, then the server switch (feature_flags.on_device_pose, so it can be
// turned off without a new build), then a per-phone crash guard: an attempt marker
// left behind means the app died inside the native model last time, so this phone
// uses server pose from then on.
export async function shouldRunDevicePose(): Promise<boolean> {
  if (!onDevicePoseEnabled()) return false;
  if ((await AsyncStorage.getItem(POSE_DISABLED_KEY)) === '1') return false;
  if ((await AsyncStorage.getItem(POSE_ATTEMPT_KEY)) === '1') {
    await AsyncStorage.multiSet([[POSE_DISABLED_KEY, '1']]);
    await AsyncStorage.removeItem(POSE_ATTEMPT_KEY);
    return false;
  }
  try {
    const { data } = await supabase.from('feature_flags').select('enabled').eq('key', SERVER_SWITCH).maybeSingle();
    return data?.enabled === true;
  } catch {
    return false;
  }
}

// Body pose for the prepared clip, as the JSON to upload, or null when the flag is
// off or the models fail (the server then runs its own pose model).
export async function analyzeClipPose(uri: string, onProgress: (p: number) => void): Promise<string | null> {
  if (!onDevicePoseEnabled() || PoseCoreML === null) return null;
  const sub = PoseCoreML.addListener('onProgress', (e) => onProgress(e.progress));
  await AsyncStorage.setItem(POSE_ATTEMPT_KEY, '1');
  // Leaving the app mid-model is an interruption, not a crash: iOS may end the app in the background.
  const away = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void AsyncStorage.removeItem(POSE_ATTEMPT_KEY);
  });
  try {
    return poseJson(await PoseCoreML.analyzePose(uri));
  } catch {
    return null;
  } finally {
    await AsyncStorage.removeItem(POSE_ATTEMPT_KEY);
    away.remove();
    sub.remove();
  }
}
