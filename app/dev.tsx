import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../src/design/tokens';
import { display, fontFamily } from '../src/design/typography';
import SmallCaps from '../src/components/SmallCaps';
import { ANALYSES } from '../src/analysis/fixtures';
import { FAILURE_REASONS } from '../src/features/library/failures';
import { loadLibrary } from '../src/features/library/repository';

// Dev entry (long-press the version on the You tab): opens every state with a fixture.
// Dev builds only; a release build reaching it by deep link goes home.
const ENTRIES: { label: string; href: string; library?: 'seeded' | 'empty' }[] = [
  { label: 'Lifts · populated', href: '/', library: 'seeded' },
  { label: 'Lifts · day one', href: '/', library: 'empty' },
  { label: 'Cues · active + past', href: '/cues', library: 'seeded' },
  { label: 'Cues · empty', href: '/cues', library: 'empty' },
  { label: 'Cue detail', href: '/cue/c-stay-over', library: 'seeded' },
  { label: 'It stuck', href: '/cue/c-finish-pull', library: 'seeded' },
  { label: "Didn't stick", href: '/cue/c-hips-mu', library: 'seeded' },
  { label: 'Trends · snatch', href: '/trends?movement=snatch', library: 'seeded' },
  { label: 'Trends · bar muscle-up', href: '/trends?movement=bar_muscle_up', library: 'seeded' },
  { label: 'Trends · fewer than 2 sessions', href: '/trends?movement=clean', library: 'seeded' },
  ...FAILURE_REASONS.map((r) => ({ label: `Couldn't analyse · ${r}`, href: `/failure/demo?reason=${r}` })),
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
