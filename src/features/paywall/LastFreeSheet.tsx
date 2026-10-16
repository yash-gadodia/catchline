import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { FREE_VIDEOS } from './entitlements';
import { t } from '../../i18n';
import { Backdrop, Body, SheetTitle, useSheetTop } from './ui';

// Before the third free analysis (Otter/Fuse pattern): warn at the point of
// use and still let the action through.
export default function LastFreeSheet({ onContinue, onPlans }: { onContinue: () => void; onPlans: () => void }) {
  const total = FREE_VIDEOS.organic;
  const sheet = useSheetTop();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="last-free">
      <Backdrop art="power" sheetTop={sheet.top} />
      <Sheet gap={space.s4} onLayout={sheet.onLayout} testID="paywall-sheet">
        <SheetTitle size={34}>{t('paywall.last.title')}</SheetTitle>
        <Body>{t('paywall.last.body')}</Body>
        <Btn onPress={onContinue} testID="last-free-continue">
          {t('paywall.last.film')}
        </Btn>
        <Btn kind="secondary" onPress={onPlans} testID="last-free-plans">
          {t('paywall.seePlans')}
        </Btn>
        <Text style={{ color: colors.text2, ...type.readout, textAlign: 'center' }}>
          {t('paywall.last.count', { n: total, total })}
        </Text>
      </Sheet>
    </View>
  );
}
