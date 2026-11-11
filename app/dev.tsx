import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../src/design/tokens';
import { display, type } from '../src/design/typography';
import SmallCaps from '../src/components/SmallCaps';
import { ANALYSES } from '../src/analysis/fixtures';
import { FAILURE_REASONS } from '../src/features/library/failures';
import { loadLibrary } from '../src/features/library/repository';
import { onScreenshot } from '../src/features/feedback/screenshot';

// Dev entry (long-press the version on the You tab): opens every state with a fixture.
// Dev builds only; a release build reaching it by deep link goes home.
const ENTRIES: { label: string; href: string; library?: 'seeded' | 'empty' }[] = [
  { label: 'Lifts · populated', href: '/', library: 'seeded' },
  { label: 'Lifts · day one', href: '/', library: 'empty' },
  ...FAILURE_REASONS.map((r) => ({ label: `Couldn't analyse · ${r}`, href: `/failure/demo?reason=${r}` })),
  { label: 'Processing (live)', href: '/analysis/processing' },
  { label: 'Processing · in progress', href: '/analysis/processing?state=progress&step=2' },
  { label: 'Processing · long wait', href: '/analysis/processing?state=long&elapsed=48' },
  { label: 'Processing · done', href: '/analysis/processing?state=done' },
  { label: 'Player', href: '/analysis/player' },
  { label: 'Real CV · player', href: '/analysis/player?fixture=snatch-real' },
  { label: 'Paywall and plans', href: '/paywall/dev' },
];

export default function DevEntry() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shot } = useLocalSearchParams<{ shot?: string }>();
  // ?shot=1 plays the system screenshot (the dev client has no native listener)
  useEffect(() => {
    if (shot) void onScreenshot();
  }, [shot]);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s8 }}
    >
      <SmallCaps>Dev · every state</SmallCaps>
      <Text style={[display(56), { color: colors.text, marginTop: space.s2, marginBottom: space.s5 }]}>Catchline</Text>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
        {ENTRIES.map((e) => (
          <Pressable
            key={e.label}
            onPress={() => {
              if (e.library) loadLibrary(e.library);
              router.push(e.href as Href);
            }}
            testID={`dev-${e.label}`}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}
          >
            <Text style={{ color: colors.text, ...type.body }}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.text3, ...type.readout, marginTop: space.s5 }}>
        {`fixtures: ${Object.keys(ANALYSES).join(' · ')}`}
      </Text>
    </ScrollView>
  );
}
