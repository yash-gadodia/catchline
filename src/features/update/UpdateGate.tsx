import { Linking, Pressable, View } from 'react-native';
import Text from '../../components/Text';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { APP_STORE_URL } from '../../lib/links';
import { EVENTS, track } from '../../lib/analytics';
import { Body, SheetTitle } from '../share/ui';
import { dismissRecommended, showsRecommended, useAppUpdate } from './appUpdate';

const openStore = (need: 'required' | 'recommended') => {
  track(EVENTS.UPDATE_STORE_OPENED, { need });
  Linking.openURL(APP_STORE_URL).catch(() => undefined);
};

// Over the whole app, mounted once: below the minimum version, a screen with nothing behind it but the App Store;
// below the recommended version, a sheet once a day.
export default function UpdateGate() {
  const state = useAppUpdate();
  if (state.need === 'required') {
    return (
      <View
        testID="update-required"
        accessibilityViewIsModal
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.bg, justifyContent: 'center', padding: space.gutter, gap: space.s4 }}
      >
        <Text style={{ ...type.title, color: colors.text }}>{t('common.update.title')}</Text>
        <Text style={{ ...type.body, color: colors.text2 }}>{t('common.update.body')}</Text>
        <Btn onPress={() => openStore('required')} testID="update-store">
          {t('common.update.button')}
        </Btn>
      </View>
    );
  }
  if (!showsRecommended(state)) return null;
  return (
    <View style={{ position: 'absolute', inset: 0 }} testID="update-recommended">
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={() => dismissRecommended()} accessibilityRole="button" accessibilityLabel={t('common.update.later')} testID="update-dismiss" />
      <Sheet gap={space.s4}>
        <View style={{ gap: space.s1 }}>
          <SheetTitle>{t('common.update.soon.title')}</SheetTitle>
          <Body>{t('common.update.soon.body')}</Body>
        </View>
        <Btn onPress={() => openStore('recommended')} testID="update-soon-store">
          {t('common.update.button')}
        </Btn>
        <Btn kind="secondary" onPress={() => dismissRecommended()} testID="update-later">
          {t('common.update.later')}
        </Btn>
      </Sheet>
    </View>
  );
}
