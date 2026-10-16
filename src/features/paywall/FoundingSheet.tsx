import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import { FOUNDING_PRICE_CENTS, MONTHLY_CAP, PRICE_CENTS, formatUsd, type StorePlatform } from './entitlements';
import type { Plan } from './products';
import { foundingState, seatsFraction, type FoundingSeats } from './seats';
import { Backdrop, Body, PurchaseStateSheet, SheetTitle, usePurchaseFlow, useSheetTop, type Phase } from './ui';

const FOUNDING: Plan = { kind: 'founding' };

// A live seat counter and nothing else creating urgency: no timers, no countdowns.
export default function FoundingSheet({
  seats,
  platform,
  now,
  initialPhase,
  purchase,
  onYearly,
  onSeePlans,
  onDone,
}: {
  seats: FoundingSeats;
  platform: StorePlatform;
  now: Date;
  initialPhase?: Phase;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  onYearly: () => void;
  onSeePlans: () => void;
  onDone: () => void;
}) {
  const state = foundingState(seats);
  const flow = usePurchaseFlow(purchase, initialPhase);
  const price = formatUsd(FOUNDING_PRICE_CENTS);
  const sheet = useSheetTop();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`founding-${state}`}>
      <Backdrop art="trail" sheetTop={sheet.top} />
      <Sheet gap={space.s4} onLayout={sheet.onLayout} testID="paywall-sheet">
        {flow.phase !== 'choose' ? (
          <PurchaseStateSheet
            phase={flow.phase}
            plan={FOUNDING}
            price={price}
            platform={platform}
            now={now}
            onWatch={onDone}
            onRetry={() => flow.run(FOUNDING)}
            onNotNow={onDone}
          />
        ) : state === 'soldOut' ? (
          <>
            <SmallCaps>{t('paywall.tier.founding')}</SmallCaps>
            <SheetTitle size={34}>{t('paywall.founding.taken', { total: seats.total })}</SheetTitle>
            <Body>{t('paywall.founding.thanks', { total: seats.total, price: formatUsd(PRICE_CENTS.pull.annual) })}</Body>
            <Btn kind="secondary" onPress={onSeePlans} testID="see-plans">
              {t('paywall.seePlans')}
            </Btn>
          </>
        ) : (
          <>
            <SmallCaps>{t('paywall.tier.founding')}</SmallCaps>
            {state === 'open' ? <SheetTitle size={34}>{t('paywall.founding.open', { price })}</SheetTitle> : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s3 }}>
              <Text testID="seats-remaining" style={[display(64), { color: colors.flare }]}>
                {String(seats.remaining)}
              </Text>
              <Text
                style={{ flex: 1, color: colors.text2, ...type.callout, marginBottom: 6 }}
              >
                {state === 'low'
                  ? t('paywall.founding.low', { total: seats.total })
                  : t('paywall.founding.left', { total: seats.total })}
              </Text>
            </View>
            <View style={{ height: 2, backgroundColor: colors.hairline }}>
              <View
                testID={`seats-bar-${state}`}
                style={{
                  height: 2,
                  width: `${Math.round(seatsFraction(seats) * 1000) / 10}%`,
                  backgroundColor: state === 'low' ? colors.flare : colors.text,
                }}
              />
            </View>
            <View style={{ gap: space.s1 }}>
              <Body>{t('paywall.founding.everything', { count: MONTHLY_CAP.founding })}</Body>
              <Body>{t('paywall.founding.badge')}</Body>
              <Body>{t('paywall.founding.price')}</Body>
            </View>
            <Btn onPress={() => flow.run(FOUNDING)} testID="take-seat">
              {t('paywall.takeSeat', { price })}
            </Btn>
            <Btn kind="text" onPress={onYearly} testID="pay-yearly" style={{ alignSelf: 'center' }}>
              {t('paywall.founding.yearly')}
            </Btn>
          </>
        )}
      </Sheet>
    </View>
  );
}
