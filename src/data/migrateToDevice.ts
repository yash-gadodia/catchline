import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { Analysis } from '../analysis/types';
import { deleteServerAnalyses, ensureSession, listAnalyses, signedTraceUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import { hasLocalLift, saveLocalLift } from './localLifts';
import { onDeviceAnalysisEnabled } from './onDeviceAnalysis';

// First 3.1 launch with on-device analysis on: every analysis, still and trace the
// server holds for this account comes down to the phone, then the server is asked
// to forget them (delete_my_server_analyses). Runs again on the next launch until it
// gets through; a lift already on the phone is skipped.
export const MOVED_KEY = 'catchline-server-analyses-moved-v1';

function fileName(url: string): string {
  const path = url.split('?')[0];
  return path.slice(path.lastIndexOf('/') + 1);
}

export async function moveServerAnalysesToDevice(): Promise<{ moved: number; deleted: number } | null> {
  if (!onDeviceAnalysisEnabled()) return null;
  if ((await AsyncStorage.getItem(MOVED_KEY)) === '1') return null;
  await ensureSession();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;

  const rows = await listAnalyses();
  const tmp = new Directory(Paths.cache, 'server-analyses');
  tmp.create({ intermediates: true, idempotent: true });
  let moved = 0;
  for (const { liftId, analysis } of rows) {
    if (hasLocalLift(liftId)) continue;
    const stills: Record<string, string> = {};
    const reps: Analysis['reps'] = [];
    for (const r of analysis.reps) {
      const keyFrames = [];
      for (const k of r.keyFrames) {
        if (!k.image) {
          keyFrames.push(k);
          continue;
        }
        const name = fileName(k.image);
        const file = await File.downloadFileAsync(k.image, new File(tmp, `${liftId}-${name}`), { idempotent: true });
        stills[name] = file.uri;
        keyFrames.push({ ...k, image: name });
      }
      reps.push({ ...r, keyFrames });
    }
    const traceUrl = await signedTraceUrl(userId, liftId);
    const trace = traceUrl ? await File.downloadFileAsync(traceUrl, new File(tmp, `${liftId}.json.gz`), { idempotent: true }) : null;
    saveLocalLift(liftId, { ...analysis, reps }, trace?.uri ?? null, stills);
    moved++;
  }
  const deleted = await deleteServerAnalyses();
  await AsyncStorage.setItem(MOVED_KEY, '1');
  return { moved, deleted };
}
