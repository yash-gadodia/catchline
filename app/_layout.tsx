import { useEffect, useState } from 'react';
import { isNudge, scheduleFirstLiftNudges } from '../src/features/notifications/nudges';
import { listLocalAnalyses } from '../src/data/localLifts';
import { sweepClipCache } from '../src/data/clipCache';
import * as SplashScreen from 'expo-splash-screen';
import { LaunchOverlay } from '../src/components/Mark';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAppFonts } from '../src/design/fonts';
import { queryClient } from '../src/lib/queryClient';
import { usePurchases } from '../src/features/purchases/usePurchases';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/design/tokens';
import { supabase } from '../src/lib/supabase';
import { backendEnabled } from '../src/data/backend';
import { syncLibrary } from '../src/data/library';
import { moveServerAnalysesToDevice } from '../src/data/migrateToDevice';
import { syncServerUsage } from '../src/features/paywall/hooks';
import { flushLiftOutbox } from '../src/data/liftOutbox';
import { resumeDeviceLifts } from '../src/data/devicePipeline';
import { flushProblemReports } from '../src/data/problemReports';
import { flushContactEmail } from '../src/data/contact';
import { installForegroundHandler, liftIdFromResponse, registerPushToken, routeForLift } from '../src/features/notifications';
import { init as initAnalytics, identify, reset, track, EVENTS } from '../src/lib/analytics';
import { startAuthUserSync } from '../src/features/auth/authUser';
import { useLocale } from '../src/i18n';
import { initSentry } from '../src/lib/sentry';
import { markLaunched, startLaunchWatchdog } from '../src/lib/launch';
import { LaunchRecovery } from '../src/components/LaunchRecovery';
// the settings store sets the saved language as it loads: imported here so that happens at launch (#92)
import '../src/features/you/settings';
import FeedbackSheet from '../src/features/feedback/FeedbackSheet';
import { FEEDBACK_CONTEXT, feedbackNotificationOpened, isFeedbackAsk, offerFeedback } from '../src/features/feedback/ask';
import ScreenshotSheet from '../src/features/feedback/ScreenshotSheet';
import { watchScreenshots } from '../src/features/feedback/screenshot';

const LAUNCH_FAILSAFE_MS = 4000;

export const unstable_settings = { initialRouteName: '(tabs)' };

initSentry();
startLaunchWatchdog();
SplashScreen.preventAutoHideAsync().catch(() => undefined);
installForegroundHandler();

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const [launched, setLaunched] = useState(false);
  const router = useRouter();
  const locale = useLocale((s) => s.locale);

  // A tapped "your lift is ready" notification (the worker's push, or the phone's own
  // once a run finished while the app was away) lands on that lift (warm, or cold via
  // the last response).
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      // a first-lift reminder was tapped: the app opens on the first screen, which is where the lift starts
      if (response && isNudge(response.notification.request.identifier)) track(EVENTS.NUDGE_OPENED, { n: Number(response.notification.request.content.data?.nudge ?? 0) });
      if (response && isFeedbackAsk(response.notification.request.identifier)) {
        feedbackNotificationOpened();
        router.push({ pathname: '/report', params: { context: FEEDBACK_CONTEXT } });
        return;
      }
      const liftId = response && liftIdFromResponse(response);
      if (!liftId) return;
      routeForLift(liftId)
        .then((href) => href && router.push(href))
        .catch(() => undefined);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    initAnalytics();
    track(EVENTS.APP_OPEN);
    // nothing is preparing, tracking or rendering yet: what an earlier run left in the caches goes
    sweepClipCache();
    // a phone with no lift yet gets its three reminders set, once
    // and a phone with two lifts is asked, once, how Catchline is working
    void listLocalAnalyses()
      .then((lifts) => {
        offerFeedback(lifts.length);
        return scheduleFirstLiftNudges(lifts.length > 0);
      })
      .catch(() => undefined);

    // Initialise RevenueCat once (real SDK in a dev build; no-op in Expo Go).
    usePurchases.getState().configure();

    if (!backendEnabled()) {
      void syncServerUsage();
      return;
    }
    const stopAuthUserSync = startAuthUserSync();
    void flushProblemReports();
    void flushContactEmail();
    syncLibrary()
      .catch(() => undefined)
      .then(() => syncServerUsage())
      // 3.1: bring the server's copies of this account's analyses down, then have the server forget them.
      .then(() => moveServerAnalysesToDevice())
      .then((moved) => (moved?.moved ? syncLibrary() : undefined))
      .catch(() => undefined);

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        identify(data.session.user.id);
        registerPushToken();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        identify(session.user.id);
        // Lifts analysed offline or before an account existed reach the server now.
        void flushLiftOutbox();
        if (event === 'SIGNED_IN') registerPushToken();
      } else if (event === 'SIGNED_OUT') {
        reset();
      }
    });

    return () => {
      subscription.unsubscribe();
      stopAuthUserSync();
    };
  }, []);

  // Failsafe: whatever happens to the launch draw, the splash and the overlay go.
  useEffect(() => {
    if (!fontsLoaded) return;
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
      setLaunched(true);
    }, LAUNCH_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  useEffect(() => {
    if (launched) markLaunched();
  }, [launched]);

  useEffect(() => watchScreenshots(), []);

  // A lift the app was killed in the middle of is tracked again from where it was saved (#250).
  useEffect(() => {
    void resumeDeviceLifts();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void resumeDeviceLifts();
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <LaunchRecovery />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppErrorBoundary>
            <StatusBar style="light" />
            <Stack key={locale} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
            {launched ? null : (
              <LaunchOverlay onShown={() => SplashScreen.hideAsync().catch(() => undefined)} onDone={() => setLaunched(true)} />
            )}
            <ScreenshotSheet />
            <FeedbackSheet />
            <LaunchRecovery />
          </AppErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
