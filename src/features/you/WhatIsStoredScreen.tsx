import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { onDeviceAnalysisEnabled } from '../../data/onDeviceAnalysis';

export function stored(): { id: string; title: string; body: string; keep: string }[] {
  const onDevice = onDeviceAnalysisEnabled();
  return [
    { id: 'originals', title: t('you.stored.originals.title'), body: onDevice ? t('you.stored.originals.onDevice') : t('you.stored.originals.body'), keep: onDevice ? t('you.stored.kept') : '24 h' },
    { id: 'positions', title: t('you.stored.positions.title'), body: onDevice ? t('you.stored.positions.onDevice') : t('you.stored.positions.body'), keep: t('you.stored.kept') },
    { id: 'frames', title: t('you.stored.frames.title'), body: onDevice ? t('you.stored.frames.onDevice') : t('you.stored.frames.body'), keep: t('you.stored.kept') },
    { id: 'cues', title: t('you.stored.cues.title'), body: t('you.stored.cues.body'), keep: t('you.stored.kept') },
  ];
}

export default function WhatIsStoredScreen({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="what-is-stored">
      <TopBar
        back={t('you.title')}
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('you.whatIsStored')}</Text>}
      />
      <ScrollView contentContainerStyle={{ paddingTop: space.s4, paddingHorizontal: space.gutter }}>
        {stored().map((r) => (
          <Item key={r.id} title={r.title} body={r.body} right={<Keep>{r.keep}</Keep>} />
        ))}
      </ScrollView>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7 }}>
        <Btn kind="secondary" onPress={onExport} testID="stored-export">
          {t('you.exportAll')}
        </Btn>
      </View>
    </View>
  );
}

function Keep({ children }: { children: string }) {
  return <Text style={{ color: colors.text2, ...type.caption }}>{children}</Text>;
}

function Item({ title, body, right }: { title: string; body: string; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.s3, paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, ...type.button }}>{title}</Text>
        <Text style={{ color: colors.text2, ...type.callout }}>{body}</Text>
      </View>
      {right}
    </View>
  );
}
