import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { CHANGELOG, type ChangelogEntry } from './changelog';

export default function WhatsNewScreen({
  back,
  onBack,
  entries = CHANGELOG,
}: {
  back: string;
  onBack: () => void;
  entries?: ChangelogEntry[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="whats-new">
      <TopBar
        back={back}
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('you.whatsNew')}</Text>}
      />
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingBottom: insets.bottom + space.s6, gap: space.s6 }}>
        {entries.map((e) => (
          <View key={e.version} style={{ gap: space.s3 }} testID={`whats-new-${e.version}`}>
            <SmallCaps size={12}>{t('you.whatsNew.version', { version: e.version })}</SmallCaps>
            {e.items.map((key) => (
              <Text key={key} style={{ color: colors.text, ...type.body }}>
                {t(key)}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
