import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export const EVENTS = {
  APP_OPEN: 'app_open',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_COMPLETED: 'purchase_completed',
  SIGN_IN_FAILED: 'sign_in_failed',
  ACCOUNT_DELETED: 'account_deleted',
  FRAMING_CHECKED: 'framing_checked',
  ANALYSIS_COMPLETED: 'analysis_completed',
  ANALYSIS_FAILED: 'analysis_failed',
  TRACK_STARTED: 'track_started',
  TRACK_COMPLETED: 'track_completed',
  PLAYER_OPENED: 'player_opened',
  SHARE_OPENED: 'share_opened',
  SHARE_EXPORTED: 'share_exported',
  SHARE_COMPLETED: 'share_completed',
  INVITE_OPENED: 'invite_opened',
  INVITE_SHARED: 'invite_shared',
  REFERRAL_CLAIMED: 'referral_claimed',
  INVITE_PROMPT_TAPPED: 'invite_prompt_tapped',
  // first-lift reminders: set at first launch, and an app open that came from tapping one
  NUDGES_SCHEDULED: 'nudges_scheduled',
  NUDGE_OPENED: 'nudge_opened',
  // the first run, step by step: where a new lifter stops before a tracked lift
  WELCOME_VIEWED: 'welcome_viewed',
  WELCOME_CHOICE: 'welcome_choice',
  VIDEO_PICKED: 'video_picked',
  IMPORT_CANCELLED: 'import_cancelled',
  PLATE_CHECK_SHOWN: 'plate_check_shown',
  PLATE_CHECK_RESULT: 'plate_check_result',
  TRACK_CANCELLED: 'track_cancelled',
  SAMPLE_OPENED: 'sample_opened',
  // the result card a new lift opens on, and what was chosen from it
  RESULT_VIEWED: 'result_viewed',
  RESULT_ACTION: 'result_action',
  // the paywall between seeing it and paying
  PAYWALL_PLAN_SELECTED: 'paywall_plan_selected',
  PURCHASE_STARTED: 'purchase_started',
  PURCHASE_NOT_COMPLETED: 'purchase_not_completed',
  RATING_ASK_SHOWN: 'rating_ask_shown',
  RATING_ASK_RATE: 'rating_ask_rate',
  RATING_ASK_LATER: 'rating_ask_later',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

type Props = Record<string, string | number | boolean>;

const ANON_ID_KEY = '@catchline/anon_id';
const CRASH_KEY = '@catchline/last_crash';

let enabled = false;
let endpoint = '';
let apiKey = '';
let userId: string | null = null;
let anonId: string | null = null;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getOrCreateAnonId(): Promise<string> {
  if (anonId) return anonId;
  try {
    const stored = await AsyncStorage.getItem(ANON_ID_KEY);
    if (stored) {
      anonId = stored;
      return anonId;
    }
    const fresh = uuid();
    await AsyncStorage.setItem(ANON_ID_KEY, fresh);
    anonId = fresh;
    return anonId;
  } catch {
    return uuid();
  }
}

export function init(): void {
  const key = process.env.EXPO_PUBLIC_ANALYTICS_KEY;
  if (!key) {
    enabled = false;
    return;
  }
  apiKey = key;
  endpoint = process.env.EXPO_PUBLIC_ANALYTICS_HOST
    ? `${process.env.EXPO_PUBLIC_ANALYTICS_HOST}/capture`
    : 'https://us.i.posthog.com/capture';
  enabled = true;
  catchGlobalErrors();
  AsyncStorage.getItem(CRASH_KEY)
    .then((saved) => {
      if (!saved) return;
      AsyncStorage.removeItem(CRASH_KEY);
      const crash = JSON.parse(saved) as { message: string; stack: string; release: Props };
      getOrCreateAnonId().then((anon) =>
        sendEvent('$exception', {
          $exception_message: crash.message,
          stack: crash.stack,
          fatal: true,
          ...crash.release,
          distinct_id: userId ?? anon,
        }),
      );
    })
    .catch(() => {});
}

// Which binary and which OTA an event came from, so a crash maps to the update that shipped it
// and the rollback decision has data.
function release(): Props {
  return {
    $app_version: Constants.expoConfig?.version ?? 'unknown',
    update_id: Updates.updateId ?? 'embedded',
    runtime_version: Updates.runtimeVersion ?? 'unknown',
    channel: Updates.channel ?? 'none',
  };
}

// A fatal JS error kills the app before a fetch can finish, so it is saved and sent on the next launch.
function catchGlobalErrors(): void {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? '').slice(0, 2000) : '';
    if (isFatal) {
      AsyncStorage.setItem(CRASH_KEY, JSON.stringify({ message, stack, release: release() })).catch(() => {});
    } else {
      captureError(error, { fatal: false });
    }
    previous(error, isFatal);
  });
}

export function identify(id: string): void {
  userId = id;
  if (!enabled) return;
  getOrCreateAnonId().then((anon) => {
    // distinct_id is the account and $anon_distinct_id the phone's id before it: PostHog joins the two into one
    // person. Without distinct_id the event is dropped, and every lifter counts twice (17-11-2026).
    sendEvent('$identify', {
      distinct_id: id,
      $anon_distinct_id: anon,
      $set: { user_id: id },
    });
  });
}

export function reset(): void {
  userId = null;
  anonId = null;
}

export function track(event: EventName, props?: Props): void {
  if (!enabled) return;
  getOrCreateAnonId().then((anon) => {
    sendEvent(event, { ...props, distinct_id: userId ?? anon });
  });
}

export function captureError(error: unknown, context?: Props): void {
  if (!enabled) {
    if (__DEV__) {
      console.warn('[analytics] error (no-op, key not set):', error);
    }
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  getOrCreateAnonId().then((anon) => {
    sendEvent('$exception', {
      $exception_message: message,
      stack: error instanceof Error ? (error.stack ?? '').slice(0, 2000) : '',
      ...context,
      distinct_id: userId ?? anon,
    });
  });
}

function sendEvent(event: string, props: Record<string, unknown>): void {
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, event, properties: { ...release(), ...props } }),
  }).catch(() => {});
}
