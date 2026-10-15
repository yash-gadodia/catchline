import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { Href } from 'expo-router';
import { Platform } from 'react-native';
import { putLiveAnalysis } from '../../analysis/live';
import { syncLibrary } from '../../data/library';
import { getAnalysis, getLift } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// GATE: fully fires only once EAS/APNs creds are added by Yash.
// All functions no-op gracefully when:
//   - running in Expo Go (no push entitlement)
//   - permissions denied
//   - module unavailable

function isAvailable(): boolean {
  // expo-notifications doesn't work in Expo Go on simulators for remote push,
  // but local notifications work. We guard against thrown errors below.
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

// Without a handler iOS drops a push that arrives while the app is open.
export function foregroundBehavior(): Notifications.NotificationBehavior {
  return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
}

export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({ handleNotification: async () => foregroundBehavior() });
}

export async function requestPermissions(): Promise<boolean> {
  if (!isAvailable()) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// Get the Expo push token and persist it to profiles.push_token.
// GATE: only works with a real EAS project + APNs/FCM credentials.
// promptIfNeeded stays false for background callers (app launch, SIGNED_IN):
// the OS dialog must appear at the notify-time step where it has context, not
// cold in the middle of pairing. Callers that own that moment opt in.
export async function registerPushToken(promptIfNeeded = false): Promise<void> {
  if (!isAvailable()) return;
  try {
    const granted = promptIfNeeded
      ? await requestPermissions()
      : (await Notifications.getPermissionsAsync()).status === 'granted';
    if (!granted) return;

    // Standalone (EAS) builds need the project ID to mint a push token, or this
    // throws and no token is ever registered. Read it from app.json (set by eas init).
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;
    if (!token) return;

    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;

    await supabase.from('profiles').update({ push_token: token }).eq('id', uid);
  } catch {
    // GATE: getExpoPushTokenAsync throws in Expo Go without EAS project ID.
    // No-op so the demo never crashes.
  }
}

// The worker's push carries `{ liftId }` and nothing else.
export function liftIdFromResponse(response: Notifications.NotificationResponse): string | null {
  const id = response.notification.request.content.data?.liftId;
  return typeof id === 'string' && id ? id : null;
}

// Where a tapped "your lift is ready" notification should land: the reveal for
// a finished lift, the failure screen for a failed one, nowhere if it is still
// processing (the lift is in the library once it finishes).
export async function routeForLift(liftId: string): Promise<Href | null> {
  const lift = await getLift(liftId);
  if (!lift) return null;
  if (lift.status === 'failed') return { pathname: '/failure/[id]', params: { id: liftId } };
  const analysis = await getAnalysis(liftId);
  if (!analysis) return null;
  if (analysis.failure) return { pathname: '/failure/[id]', params: { id: liftId } };
  putLiveAnalysis(analysis);
  syncLibrary().catch(() => undefined);
  return { pathname: '/analysis/reveal', params: { fixture: analysis.id } };
}
