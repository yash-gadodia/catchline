import { View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { MONTHLY_CAP, capResetDate, type PaidTier } from './entitlements';
import { shortDate } from './copy';
import { t } from '../../i18n';
import { Backdrop, Body, SheetTitle, useSheetTop } from './ui';

// Monthly cap: Pull is the top plan, so the only way on is the reset.
export default function CapSheet({ tier, now, onQueue }: { tier: PaidTier; now: Date; onQueue: () => void }) {
  const reset = shortDate(capResetDate(now));
  const sheet = useSheetTop();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`cap-${tier}`}>
      <Backdrop art="setup" sheetTop={sheet.top} />
      <Sheet gap={space.s4} onLayout={sheet.onLayout} testID="paywall-sheet">
        <SheetTitle size={34}>{t('paywall.cap.title', { count: MONTHLY_CAP[tier] })}</SheetTitle>
        <Body>
          {t('paywall.cap.body', { date: reset })}
        </Body>
        <Btn kind="secondary" onPress={onQueue} testID="queue">
          {t('paywall.cap.queue', { date: reset })}
        </Btn>
      </Sheet>
    </View>
  );
}
