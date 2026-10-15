import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../src/design/tokens';
import { display, fontFamily } from '../../src/design/typography';
import SmallCaps from '../../src/components/SmallCaps';
import { chipState, EMPTY_USAGE } from '../../src/features/paywall/entitlements';
import { FreeVideosChip } from '../../src/features/paywall/ui';

const CLIP = 'clip=demo-1&movement=snatch';

// Dev entry for every paywall state. Purchases run in demo mode without RevenueCat keys;
// `outcome` forces what the demo purchase resolves to.
const ENTRIES: { label: string; href: string }[] = [
  { label: '2a Paywall at video 4', href: `/paywall?${CLIP}` },
  { label: '2b Purchasing', href: `/paywall?${CLIP}&phase=purchasing` },
  { label: '2c Success', href: `/paywall?${CLIP}&phase=success` },
  { label: '2d Failed', href: `/paywall?${CLIP}&phase=failed` },
  { label: '2e Offline', href: `/paywall?${CLIP}&phase=offline` },
  { label: 'Paywall · demo purchase fails', href: `/paywall?${CLIP}&outcome=failed` },
  { label: 'Paywall · demo purchase offline', href: `/paywall?${CLIP}&outcome=offline` },
  { label: 'Paywall · demo purchase succeeds', href: `/paywall?${CLIP}&outcome=success` },
  { label: '3 Plans · current Pull', href: '/paywall/plans?tier=pull' },
  { label: '3 Plans · founding', href: '/paywall/plans?tier=founding' },
  { label: '4a Founding member', href: '/paywall/founding?seats=137' },
  { label: '4b Founding · under 10%', href: '/paywall/founding?seats=41' },
  { label: '4c Founding · sold out', href: '/paywall/founding?seats=0' },
  { label: '5 Cap reached · Pull', href: '/paywall/cap?tier=pull' },
  { label: '5 Cap reached · Founding', href: '/paywall/cap?tier=founding' },
  { label: '7a Ad funnel · quiz', href: '/paywall/funnel/quiz' },
  { label: '7b Ad funnel · trial paywall', href: '/paywall/funnel/trial' },
  { label: '7b Trial · web checkout on', href: '/paywall/funnel/trial?web=1' },
];

const NOW = new Date();

export default function PaywallDev() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s8 }}
    >
      <SmallCaps>Dev · paywall and plans</SmallCaps>
      <Text style={[display(48), { color: colors.text, marginTop: space.s2, marginBottom: space.s4 }]}>Paywall</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginBottom: space.s5 }}>
        {[0, 1, 2, 3].map((n) => (
          <FreeVideosChip key={n} state={chipState('free', { ...EMPTY_USAGE, lifetime: n }, NOW)} />
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
        {ENTRIES.map((e) => (
          <Pressable
            key={e.href}
            onPress={() => router.push(e.href as Href)}
            testID={`dev-${e.label}`}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}
          >
            <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
