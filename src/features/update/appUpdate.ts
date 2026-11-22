import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeApplicationVersion } from 'expo-application';
import { backendEnabled } from '../../data/backend';
import { ensureSession, getVersionFlags, type VersionFlags } from '../../lib/api';
import { EVENTS, track } from '../../lib/analytics';

// Force update: feature_flags rows `min_app_version` and `recommended_app_version`, each counted only while
// `enabled`, with the version in `note`. Below the minimum the app is blocked on an "Update Catchline" screen; below
// the recommended version a sheet suggests it, at most once a day. The installed binary's own version is what is
// compared (an OTA cannot change it). Anything unknown (offline, no row, an unreadable version) never blocks.
export type UpdateNeed = 'required' | 'recommended' | 'none';

// -1, 0 or 1, numerically per dot-separated part (4.0.10 > 4.0.9; 4.1 = 4.1.0); null when either is not a version.
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split('.').map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const below = (installed: string, version: string | null) => version !== null && compareVersions(installed, version) === -1;

export function updateNeed(installed: string | null, flags: VersionFlags): UpdateNeed {
  if (!installed) return 'none';
  if (below(installed, flags.min)) return 'required';
  if (below(installed, flags.recommended)) return 'recommended';
  return 'none';
}

const today = (now: Date) => now.toISOString().slice(0, 10);

// need: this run's answer. dismissedOn: the day the recommended sheet was last closed (kept on the phone).
type UpdateState = { need: UpdateNeed; dismissedOn: string | null };
export const useAppUpdate = create<UpdateState>()(
  persist((): UpdateState => ({ need: 'none', dismissedOn: null }), {
    name: 'catchline-app-update',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ dismissedOn }) => ({ dismissedOn }) as UpdateState,
  }),
);

export function showsRecommended(s: UpdateState, now = new Date()): boolean {
  return s.need === 'recommended' && s.dismissedOn !== today(now);
}

export function dismissRecommended(now = new Date()): void {
  useAppUpdate.setState({ dismissedOn: today(now) });
  track(EVENTS.UPDATE_PROMPT_LATER, {});
}

// At launch and on every return to the foreground. A failed read keeps what this run already knew: a cold start with
// no network stays unblocked.
export async function checkForUpdate(installed: string | null = nativeApplicationVersion): Promise<UpdateNeed> {
  if (!backendEnabled()) return useAppUpdate.getState().need;
  try {
    await ensureSession();
    const flags = await getVersionFlags();
    const need = updateNeed(installed, flags);
    const before = useAppUpdate.getState().need;
    useAppUpdate.setState({ need });
    if (need !== 'none' && need !== before) track(EVENTS.UPDATE_NEEDED, { need, installed: installed ?? 'unknown' });
    return need;
  } catch {
    return useAppUpdate.getState().need;
  }
}
