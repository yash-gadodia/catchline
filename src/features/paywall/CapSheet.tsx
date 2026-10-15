import { View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { MONTHLY_CAP, capResetDate, type PaidTier } from './entitlements';
import { shortDate } from './copy';
import { Backdrop, Body, SheetTitle } from './ui';

// Monthly cap: Pull is the top plan, so the only way on is the reset.
export default function CapSheet({ tier, now, onQueue }: { tier: PaidTier; now: Date; onQueue: () => void }) {
  const reset = shortDate(capResetDate(now));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`cap-${tier}`}>
      <Backdrop image="asset:snatch/ghost/3-hip" opacity={0.55} />
      <Sheet gap={space.s4}>
        <SheetTitle size={34}>{`You've used your ${MONTHLY_CAP[tier]} this month.`}</SheetTitle>
        <Body>
          {`Resets on ${reset}. This clip is saved and goes through then. Filming and everything you've already analysed keep working.`}
        </Body>
        <Btn kind="secondary" onPress={onQueue} testID="queue">
          {`Queue until ${reset}`}
        </Btn>
      </Sheet>
    </View>
  );
}
