import * as SplashScreen from 'expo-splash-screen';
import { create } from 'zustand';
import { reportMessage } from './sentry';

// Past this with no first screen, the lifter gets a retry screen instead of a silent splash
// (a tester stuck on the launch screen with no report, 22 Oct 2026).
export const LAUNCH_STALL_MS = 12000;

export const useLaunch = create<{ ready: boolean; stalled: boolean }>(() => ({ ready: false, stalled: false }));

let timer: ReturnType<typeof setTimeout> | null = null;

export function startLaunchWatchdog(stallMs: number = LAUNCH_STALL_MS): void {
  if (timer || useLaunch.getState().ready) return;
  timer = setTimeout(() => {
    timer = null;
    if (useLaunch.getState().ready) return;
    useLaunch.setState({ stalled: true });
    SplashScreen.hideAsync().catch(() => undefined);
    reportMessage('launch_stalled', { stall_ms: String(stallMs) });
  }, stallMs);
}

export function markLaunched(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!useLaunch.getState().ready) useLaunch.setState({ ready: true, stalled: false });
}
