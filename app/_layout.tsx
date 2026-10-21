import { useEffect, useState } from 'react';
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
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/design/tokens';
import { supabase } from '../src/lib/supabase';
import { backendEnabled } from '../src/data/backend';
import { syncLibrary } from '../src/data/library';
import { moveServerAnalysesToDevice } from '../src/data/migrateToDevice';
import { syncServerUsage } from '../src/features/paywall/hooks';
import { flushLiftOutbox } from '../src/data/liftOutbox';
import { installForegroundHandler, liftIdFromResponse, registerPushToken, routeForLift } from '../src/features/notifications';
import { init as initAnalytics, identify, reset, track, EVENTS } from '../src/lib/analytics';
import { startAuthUserSync } from '../src/features/auth/authUser';
import { useLocale } from '../src/i18n';

const LAUNCH_FAILSAFE_MS = 4000;

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync().catch(() => undefined);
installForegroundHandler();

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const [launched, setLaunched] = useState(false);
  const router = useRouter();
  const locale = useLocale((s) => s.locale);

  // A tapped "your lift is ready" push lands on that lift (warm, or cold via the
  // last response).
  useEffect(() => {
    if (!backendEnabled()) return;
    const open = (response: Notifications.NotificationResponse | null) => {
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

    // Initialise RevenueCat once (real SDK in a dev build; no-op in Expo Go).
    usePurchases.getState().configure();

    if (!backendEnabled()) {
      void syncServerUsage();
      return;
    }
    const stopAuthUserSync = startAuthUserSync();
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

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
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
          </AppErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
