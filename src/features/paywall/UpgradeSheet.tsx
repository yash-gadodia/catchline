import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { TIER_NAME, featureDelta, formatUsd, type Period, type StorePlatform, type SubTier, type UpgradeQuote } from './entitlements';
import { foundingUpgradeLine, planPrice, upgradePriceLine } from './copy';
import type { Plan } from './products';
import { Backdrop, PurchaseStateSheet, Row, SheetTitle, usePurchaseFlow } from './ui';

// Upgrading from a lower tier shows only what changes and what it costs today.
export default function UpgradeSheet({
  from,
  to,
  period,
  quote,
  platform,
  now,
  purchase,
  onStay,
  onDone,
}: {
  from: SubTier | 'founding';
  to: SubTier;
  period: Period;
  quote: UpgradeQuote;
  platform: StorePlatform;
  now: Date;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  onStay: () => void;
  onDone: () => void;
}) {
  const plan: Plan = { kind: 'sub', tier: to, period };
  const flow = usePurchaseFlow(purchase);
  const rows = featureDelta(from, to);
  const today = formatUsd(quote.chargeTodayCents);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`upgrade-${from}-${to}`}>
      <Backdrop />
      <Sheet gap={space.s4}>
        {flow.phase !== 'choose' ? (
          <PurchaseStateSheet
            phase={flow.phase}
            plan={plan}
            price={planPrice(plan)}
            platform={platform}
            now={now}
            onWatch={onDone}
            onRetry={() => flow.run(plan)}
            onNotNow={onStay}
          />
        ) : (
          <>
            <SmallCaps>{`${from === 'founding' ? 'Founding' : TIER_NAME[from]} → ${TIER_NAME[to]}`}</SmallCaps>
            <SheetTitle size={34}>What changes</SheetTitle>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
              {rows.map((r) => (
                <Row key={r.label}>
                  <Text style={{ flex: 1, color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}>
                    {r.label}
                  </Text>
                  <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
                    {r.value}
                  </Text>
                </Row>
              ))}
              <Row last>
                <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}>Price</Text>
                <Text
                  testID="upgrade-price"
                  style={{ flex: 1, textAlign: 'right', color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}
                >
                  {from === 'founding'
                    ? foundingUpgradeLine(period, quote.chargeTodayCents)
                    : upgradePriceLine(quote.deltaCents, period, quote.chargeTodayCents, quote.creditCents)}
                </Text>
              </Row>
            </View>
            <Btn onPress={() => flow.run(plan)} testID="upgrade">
              {`Upgrade · ${today} today`}
            </Btn>
            <Btn kind="text" onPress={onStay} testID="stay" style={{ alignSelf: 'center' }}>
              {from === 'founding' ? 'Stay on Pull' : `Stay on ${TIER_NAME[from]}`}
            </Btn>
          </>
        )}
      </Sheet>
    </View>
  );
}
