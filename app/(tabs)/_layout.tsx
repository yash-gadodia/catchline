import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, Tabs, useRouter, type Href } from 'expo-router';
import { usePipeline } from '../../src/data/pipeline';
import { syncLibrary } from '../../src/data/library';
import InFlightBar from '../../src/features/library/InFlightBar';
import { useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';
import TabBar, { type TabName } from '../../src/features/library/TabBar';
import { captureHref } from '../../src/features/paywall/hooks';
import { takeWhatsNew, whenWhatsNewHydrated } from '../../src/features/whatsnew/store';

export default function TabsLayout() {
  const router = useRouter();
  const hydrated = useHydrated();
  const completed = useOnboarding((s) => s.completed);
  const job = usePipeline((s) => s.job);
  // The upload just landed: list the lift so its row replaces the in-flight bar.
  useEffect(() => {
    if (job?.liftId) syncLibrary().catch(() => undefined);
  }, [job?.liftId]);
  // Once after an update, What's new opens over the library.
  useEffect(() => {
    if (!hydrated) return;
    return whenWhatsNewHydrated(() => {
      if (takeWhatsNew(completed)) router.push('/whats-new' as Href);
    });
  }, [hydrated]);
  if (hydrated && !completed) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigation }) => (
        <View>
          <InFlightBar job={job} onOpen={() => router.push({ pathname: '/analysis/processing', params: { live: '1' } })} />
          <TabBar
            active={state.routes[state.index].name as TabName}
            onTab={(name) => navigation.navigate(name)}
            onImport={() => router.push(captureHref('/capture/import') as Href)}
          />
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cues" />
      <Tabs.Screen name="trends" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
