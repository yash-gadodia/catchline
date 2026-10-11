import { Tabs, useRouter, type Href } from 'expo-router';
import { colors } from '../../src/design/tokens';
import TabBar, { type TabName } from '../../src/features/library/TabBar';

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          active={state.routes[state.index].name as TabName}
          onTab={(name) => navigation.navigate(name)}
          onRecord={() => router.push('/capture' as Href)}
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
