import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../src/design/tokens';
import { display, type } from '../../src/design/typography';
import SmallCaps from '../../src/components/SmallCaps';

// Dev entry for every paywall state. Purchases run in demo mode without RevenueCat keys;
// `outcome` forces what the demo purchase resolves to.
const ENTRIES: { label: string; href: string }[] = [
  { label: 'Paywall', href: '/paywall' },
  { label: 'Weekly cap · clip saved', href: '/paywall/cap?clip=demo-1' },
  { label: 'Purchasing', href: '/paywall?phase=purchasing' },
  { label: 'Success', href: '/paywall?phase=success' },
  { label: 'Failed', href: '/paywall?phase=failed' },
  { label: 'Offline', href: '/paywall?phase=offline' },
  { label: 'Demo purchase fails', href: '/paywall?outcome=failed' },
  { label: 'Demo purchase offline', href: '/paywall?outcome=offline' },
  { label: 'Demo purchase succeeds', href: '/paywall?outcome=success' },
  { label: 'Founding · under 10%', href: '/paywall?seats=41' },
  { label: 'Founding · sold out', href: '/paywall?seats=0' },
];

export default function PaywallDev() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s8 }}
    >
      <SmallCaps>Dev · paywall</SmallCaps>
      <Text style={[display(48), { color: colors.text, marginTop: space.s2, marginBottom: space.s4 }]}>Paywall</Text>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
        {ENTRIES.map((e) => (
          <Pressable
            key={e.href}
            onPress={() => router.push(e.href as Href)}
            testID={`dev-${e.label}`}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}
          >
            <Text style={{ color: colors.text, ...type.body }}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
