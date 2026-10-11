import { Redirect, Tabs, useRouter, type Href } from 'expo-router';
import { useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';
import TabBar, { type TabName } from '../../src/features/library/TabBar';
import { captureHref } from '../../src/features/paywall/hooks';

export default function TabsLayout() {
  const router = useRouter();
  const hydrated = useHydrated();
  const completed = useOnboarding((s) => s.completed);
  if (hydrated && !completed) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          active={state.routes[state.index].name as TabName}
          onTab={(name) => navigation.navigate(name)}
          onRecord={() => router.push(captureHref('/capture') as Href)}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cues" />
      <Tabs.Screen name="trends" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
