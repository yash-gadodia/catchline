import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { Toggle } from '../share/ui';
import { useSettings } from './settings';

export const STORED: { id: string; title: string; body: string; keep: string }[] = [
  {
    id: 'originals',
    title: 'Your original clips',
    body: 'On your phone. Sent once for analysis, deleted from our servers within 24 hours.',
    keep: '24 h',
  },
  {
    id: 'positions',
    title: 'Positions and bar path',
    body: 'Numbers, not video. No face points; head keypoints are dropped before storage.',
    keep: 'kept',
  },
  {
    id: 'frames',
    title: 'Key frames',
    body: 'Five stills per lift for the strobe and the evidence crop. Background people blurred.',
    keep: 'kept',
  },
  { id: 'cues', title: 'Cues and whether they stuck', body: 'Text and dates.', keep: 'kept' },
];

export default function WhatIsStoredScreen({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  const insets = useSafeAreaInsets();
  const improve = useSettings((s) => s.improveAccuracy);
  const set = useSettings((s) => s.set);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="what-is-stored">
      <TopBar
        back="You"
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>What is stored</Text>}
      />
      <ScrollView contentContainerStyle={{ paddingTop: space.s4, paddingHorizontal: space.gutter }}>
        {STORED.map((r) => (
          <Item key={r.id} title={r.title} body={r.body} right={<Keep>{r.keep}</Keep>} />
        ))}
        <Item
          title="Clips used to improve accuracy"
          body={improve ? 'Only if you turned it on. On right now.' : 'Only if you turned it on. Off right now.'}
          right={<Toggle value={improve} onChange={(v) => set('improveAccuracy', v)} testID="toggle-improve" />}
        />
      </ScrollView>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7 }}>
        <Btn kind="secondary" onPress={onExport} testID="stored-export">
          Export all my data
        </Btn>
      </View>
    </View>
  );
}

function Keep({ children }: { children: string }) {
  return <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>{children}</Text>;
}

function Item({ title, body, right }: { title: string; body: string; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.s3, paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>{title}</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>{body}</Text>
      </View>
      {right}
    </View>
  );
}
