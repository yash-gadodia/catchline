import { View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { MONTHLY_CAP, capResetDate, nextTier, type PaidTier, type Period } from './entitlements';
import { capUpgradeLabel, capUpgradeNote, shortDate } from './copy';
import { Backdrop, Body, Fine, SheetTitle } from './ui';

// Monthly cap: queueing is the first option, the upgrade second.
export default function CapSheet({
  tier,
  period,
  now,
  onQueue,
  onUpgrade,
}: {
  tier: PaidTier;
  period: Period;
  now: Date;
  onQueue: () => void;
  onUpgrade: () => void;
}) {
  const reset = shortDate(capResetDate(now));
  const to = nextTier(tier);
  const cap = MONTHLY_CAP[tier];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`cap-${tier}`}>
      <Backdrop image="asset:snatch/1-setup" opacity={0.6} />
      <Sheet gap={space.s4}>
        <SheetTitle size={34}>{`That's ${cap} this month.`}</SheetTitle>
        <Body>
          {to
            ? `Filming and everything you've already analysed keep working. This clip is saved; it can wait for ${reset} or go through now.`
            : `Platform is ${cap} a month, fair use. Filming and everything you've already analysed keep working. This clip is saved and goes through on ${reset}.`}
        </Body>
        <Btn kind="secondary" onPress={onQueue} testID="queue">
          {`Queue until ${reset}`}
        </Btn>
        {to && tier !== 'platform' ? (
          <>
            <Btn onPress={onUpgrade} testID="cap-upgrade">
              {capUpgradeLabel(tier, to, period)}
            </Btn>
            <Fine center>{capUpgradeNote(to)}</Fine>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
