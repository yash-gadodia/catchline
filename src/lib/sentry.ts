import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

let enabled = false;

// Off without a DSN. No PII, no screenshots, no view hierarchy, no replay: a crash report never
// carries the lifter or their video. iOS app hangs (a frozen JS or main thread) report as freezes.
export function initSentry(dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAppHangTracking: true,
    appHangTimeoutInterval: 5,
    tracesSampleRate: 0,
    beforeSend: (event) => {
      delete event.user;
      const model = event.contexts?.device?.model;
      if (typeof model === 'string') event.tags = { ...event.tags, device_model: model };
      return event;
    },
  });
  Sentry.setTags({
    app_version: Constants.expoConfig?.version ?? 'unknown',
    update_id: Updates.updateId ?? 'embedded',
    runtime_version: Updates.runtimeVersion ?? 'unknown',
    channel: Updates.channel ?? 'none',
  });
  enabled = true;
  return true;
}

export function reportError(error: unknown, context?: Record<string, string>): void {
  if (enabled) Sentry.captureException(error, context ? { tags: context } : undefined);
}

export function reportMessage(message: string, context?: Record<string, string>): void {
  if (enabled) Sentry.captureMessage(message, context ? { level: 'warning', tags: context } : 'warning');
}
