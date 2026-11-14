import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { formatDate, t } from '../../i18n';
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <SmallCaps size={12}>{t('you.whatsNew.version', { version: e.version })}</SmallCaps>
              {e.date ? (
                <Text style={{ color: colors.text2, ...type.readout }} testID={`whats-new-date-${e.version}`}>
                  {formatDate(new Date(`${e.date}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            {e.items.map((key) => (
              <View key={key} style={{ flexDirection: 'row', gap: space.s2 }}>
                <Text style={{ color: colors.text2, ...type.body }}>·</Text>
                <Text style={{ color: colors.text, ...type.body, flex: 1 }}>{t(key)}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
