import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { Header, Underlined } from './hud';
import { t } from '../../i18n';

// The picker was cancelled (or failed): pick again, or record instead.
export default function ImportEmpty({ onPick, onRecord, onCancel }: { onPick: () => void; onRecord: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="import-empty" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onCancel} testID="import-cancel">{t('capture.import.cancel')}</Underlined>}
        center={<Text style={[type.button, { color: colors.text }]}>{t('capture.import.title')}</Text>}
        right={<View style={{ minWidth: 60 }} />}
      />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, gap: space.s3 }}>
        <Text style={[type.title, { color: colors.text }]}>{t('capture.import.emptyTitle')}</Text>
        <Text style={[type.body, { color: colors.text2 }]}>
          {t('capture.import.emptyBody')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s3 }}>
        <Btn onPress={onPick} testID="import-pick">
          {t('capture.import.pick')}
        </Btn>
        <Btn kind="secondary" onPress={onRecord} testID="import-record">
          {t('capture.import.record')}
        </Btn>
      </View>
    </View>
  );
}
