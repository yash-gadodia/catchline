import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import Transcoder from '../../modules/clip-transcoder';
import PoseCoreML, { type PoseResult } from '../../modules/pose-coreml';
import { outputSize } from '../features/capture/compress';
import { supabase } from '../lib/supabase';
import { discardPrepared } from './prepare';

// Its own crash guard, apart from full-clip pose (onDevicePose.ts): a marker left behind means the app died
// inside the native work last time, so this phone skips the check from then on.
export const FRAMING_ATTEMPT_KEY = 'catchline-framing-attempt-v1';
export const FRAMING_DISABLED_KEY = 'catchline-framing-disabled-v1';
// A row with enabled = false turns the check off without a build; no row leaves it on.
const SERVER_SWITCH = 'framing_check';

export const SETUP_S = 1.5;
export const TIMEOUT_MS = 8000;
// The setup only: a small, 10 fps copy keeps the model to ~15 frames.
const EDGE = 720;
const FPS = 10;
const BITRATE = 2_000_000;

async function allowed(): Promise<boolean> {
  if (PoseCoreML === null) return false;
  if ((await AsyncStorage.getItem(FRAMING_DISABLED_KEY)) === '1') return false;
  if ((await AsyncStorage.getItem(FRAMING_ATTEMPT_KEY)) === '1') {
    await AsyncStorage.multiSet([[FRAMING_DISABLED_KEY, '1']]);
    await AsyncStorage.removeItem(FRAMING_ATTEMPT_KEY);
    return false;
  }
  try {
    const { data } = await supabase.from('feature_flags').select('enabled').eq('key', SERVER_SWITCH).maybeSingle();
    return data?.enabled !== false;
  } catch {
    return true;
  }
}

async function setupPose(uri: string, startS: number, endS: number): Promise<PoseResult | null> {
  if (!(await allowed()) || PoseCoreML === null) return null;
  await AsyncStorage.setItem(FRAMING_ATTEMPT_KEY, '1');
  const away = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void AsyncStorage.removeItem(FRAMING_ATTEMPT_KEY);
  });
  let trimmed: string | null = null;
  try {
    const src = await Transcoder.probe(uri);
    const out = await Transcoder.transcode({
      uri,
      startS,
      endS: Math.min(startS + SETUP_S, endS),
      ...outputSize(src.width, src.height, EDGE),
      fps: FPS,
      dropToFps: true,
      bitrate: BITRATE,
    });
    trimmed = out.uri;
    return await PoseCoreML.analyzePose(trimmed);
  } finally {
    if (trimmed) discardPrepared(trimmed);
    await AsyncStorage.removeItem(FRAMING_ATTEMPT_KEY);
    away.remove();
  }
}

// Body pose for the clip's first 1.5 s (from the trim start), or null when the check is off, fails or takes
// longer than 8 s. On a timeout the native work runs on and still clears its marker and its copy.
export function framingPose(uri: string, startS: number, endS: number): Promise<PoseResult | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    setupPose(uri, startS, endS)
      .catch(() => null)
      .then((pose) => {
        clearTimeout(timer);
        resolve(pose);
      });
  });
}
