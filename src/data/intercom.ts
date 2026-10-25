import { Platform } from 'react-native';
import Intercom from '@intercom/intercom-react-native';
import type { CustomerInfo } from 'react-native-purchases';
import * as Notifications from 'expo-notifications';
import { reportDetails } from './problemReports';
import { intercomUserHash } from '../lib/api';
import { useAuthUser } from '../features/auth/authUser';
import { usePurchases } from '../features/purchases/usePurchases';
import type { Analysis } from '../analysis/types';

const PROBE_URL = 'https://api-iam.intercom.io/';
const PROBE_TIMEOUT_MS = 3000;
const TRIAL_ENDING_MS = 2 * 24 * 60 * 60 * 1000;

let started: Promise<boolean> | null = null;
let loggedInAs: string | null | undefined;

// Both keys come from the EAS environment at build time; without them Intercom never starts.
export function intercomConfigured(): boolean {
  return Platform.OS === 'ios' && !!process.env.EXPO_PUBLIC_INTERCOM_APP_ID && !!process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY;
}

// Only these reach Intercom: never the video, stills, traces or analysis.
export function intercomAttributes(): Record<string, string> {
  const details = reportDetails();
  return {
    app_version: details.appVersion,
    ota_update_id: details.updateId,
    device_model: details.device,
    plan_tier: usePurchases.getState().tier,
  };
}

export function reportMessage(liftId?: string): string {
  const { appVersion, updateId } = reportDetails();
  const lines = ['', '', `Catchline ${appVersion} (${updateId})`];
  if (liftId) lines.push(`Lift ${liftId}`);
  return lines.join('\n');
}

export function helpMessage(facts: string[]): string {
  const { appVersion, updateId } = reportDetails();
  return ['', '', ...facts, `Catchline ${appVersion} (${updateId})`].join('\n');
}

export function failureHelp(code: string, movement: string, liftId?: string): string {
  return helpMessage([`Analysis failed: ${code}`, `Movement: ${movement}`, ...(liftId ? [`Lift ${liftId}`] : [])]);
}

export function askWhyHelp(a: Analysis): string {
  const seen = /(\d+)° off side-on/.exec(a.cue?.confidenceText ?? '');
  const deg = a.noCueReason?.offSideDeg ?? (seen ? Number(seen[1]) : undefined);
  const angle = deg != null ? `${Math.round(deg)}° off side-on` : a.yawBucket ?? 'unknown';
  const confidence = a.cue?.confidence ?? (a.detectedMovement ? `movement ${Math.round(a.detectedMovement.confidence * 100)}%` : 'unknown');
  return helpMessage([
    a.cue ? `Ask why: cue ${a.cue.faultId}` : `Ask why: no cue (${a.noCueReason?.code ?? 'none'})`,
    `Movement: ${a.movementUsed ?? a.movement}`,
    `Angle: ${angle}`,
    `Confidence: ${confidence}`,
    `Lift ${a.id}`,
  ]);
}

export function purchaseHelp(): string {
  return helpMessage(['Purchase problem', `Plan: ${usePurchases.getState().tier}`]);
}

async function online(): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(PROBE_URL, { method: 'HEAD', signal: abort.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function start(): Promise<boolean> {
  if (!started) {
    started = Intercom.initialize(process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY ?? '', process.env.EXPO_PUBLIC_INTERCOM_APP_ID ?? '').catch(() => {
      started = null;
      return false;
    });
  }
  return started;
}

async function login(): Promise<void> {
  const user = useAuthUser.getState();
  const userId = !user.anonymous && user.userId ? user.userId : null;
  if (loggedInAs === userId) {
    await Intercom.updateUser({ customAttributes: intercomAttributes() });
    return;
  }
  if (loggedInAs !== undefined) await Intercom.logout();
  const hash = userId ? await intercomUserHash().catch(() => null) : null;
  if (userId && hash) {
    await Intercom.setUserHash(hash);
    await Intercom.loginUserWithUserAttributes({ userId, customAttributes: intercomAttributes() });
  } else {
    await Intercom.loginUnidentifiedUser();
    await Intercom.updateUser({ customAttributes: intercomAttributes() });
  }
  loggedInAs = userId;
}

// Starts Intercom and logs the lifter in, only when configured and online. False means use the local queue.
async function ready(): Promise<boolean> {
  if (!intercomConfigured() || !(await online())) return false;
  try {
    if (!(await start())) return false;
    await login();
    return true;
  } catch {
    return false;
  }
}

export function openReportInIntercom(liftId?: string, body = ''): Promise<boolean> {
  return openHelpInIntercom(`${body}${reportMessage(liftId)}`);
}

export async function openHelpInIntercom(message: string): Promise<boolean> {
  if (!(await ready())) return false;
  // The SDK resolves without a value once it is on screen, so success, not the value, means opened.
  return Intercom.presentMessageComposer(message).then(
    () => true,
    () => false,
  );
}

export async function openIntercomMessenger(): Promise<boolean> {
  if (!(await ready())) return false;
  return Intercom.present().then(
    () => true,
    () => false,
  );
}

export type IntercomEvent = 'analysis_failed' | 'analysis_completed' | 'paywall_viewed' | 'trial_ending' | 'fifth_analysis' | 'subscription_cancel_viewed';

export function intercomEventsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_INTERCOM_EVENTS !== 'off';
}

export async function logIntercomEvent(name: IntercomEvent, meta: Record<string, string | number | boolean> = {}): Promise<boolean> {
  if (!intercomEventsEnabled()) return false;
  try {
    if (!(await ready())) return false;
    return await Intercom.logEvent(name, meta);
  } catch {
    return false;
  }
}

export function trialEndingAt(info: CustomerInfo | null, now: Date): string | null {
  for (const ent of Object.values(info?.entitlements?.active ?? {})) {
    if (ent.periodType !== 'TRIAL' || !ent.expirationDate) continue;
    const left = Date.parse(ent.expirationDate) - now.getTime();
    if (left > 0 && left <= TRIAL_ENDING_MS) return ent.expirationDate;
  }
  return null;
}

let trialEndingLogged: string | null = null;

export function watchTrialEnding(): () => void {
  const check = (info: CustomerInfo | null) => {
    const at = trialEndingAt(info, new Date());
    if (!at || at === trialEndingLogged) return;
    trialEndingLogged = at;
    void logIntercomEvent('trial_ending', { plan_tier: usePurchases.getState().tier, expires_at: Math.floor(Date.parse(at) / 1000) });
  };
  check(usePurchases.getState().customerInfo);
  return usePurchases.subscribe((s) => check(s.customerInfo));
}

export async function sendPushTokenToIntercom(): Promise<boolean> {
  try {
    if (!(await ready())) return false;
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== 'string' || !data) return false;
    return await Intercom.sendTokenToIntercom(data);
  } catch {
    return false;
  }
}

export async function logoutIntercom(): Promise<void> {
  if (loggedInAs === undefined) return;
  loggedInAs = undefined;
  await Intercom.logout().catch(() => false);
}

