import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../src/design/tokens';
import { display, fontFamily } from '../src/design/typography';
import SmallCaps from '../src/components/SmallCaps';
import { ANALYSES } from '../src/analysis/fixtures';

// Dev entry: opens every analysis state with a fixture until the real home exists.
const ENTRIES: { label: string; href: string }[] = [
  { label: 'Processing (live)', href: '/analysis/processing' },
  { label: 'Processing · in progress', href: '/analysis/processing?state=progress&step=2' },
  { label: 'Processing · long wait', href: '/analysis/processing?state=long&elapsed=48' },
  { label: 'Processing · done', href: '/analysis/processing?state=done' },
  { label: 'Result reveal', href: '/analysis/reveal' },
  { label: 'Cue', href: '/analysis/cue' },
  { label: 'Why this drawer', href: '/analysis/cue?why=1' },
  { label: 'Player', href: '/analysis/player' },
  { label: 'Compare · ghost', href: '/analysis/compare?mode=ghost' },
  { label: 'Compare · side by side', href: '/analysis/compare?mode=side' },
  { label: 'Low confidence', href: '/analysis/cue?fixture=snatch-mock-low' },
  { label: 'Why did I miss', href: '/analysis/miss?fixture=snatch-mock-miss' },
  { label: 'Real CV · reveal', href: '/analysis/reveal?fixture=snatch-real' },
  { label: 'Real CV · cue', href: '/analysis/cue?fixture=snatch-real' },
  { label: 'Real CV · player', href: '/analysis/player?fixture=snatch-real' },
  { label: 'Paywall and plans', href: '/paywall/dev' },
];

export default function DevEntry() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s8 }}
    >
      <SmallCaps>Dev · analysis flow</SmallCaps>
      <Text style={[display(56), { color: colors.text, marginTop: space.s2, marginBottom: space.s5 }]}>Catchline</Text>
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
      <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, marginTop: space.s5 }}>
        {`fixtures: ${Object.keys(ANALYSES).join(' · ')}`}
      </Text>
    </ScrollView>
  );
}
