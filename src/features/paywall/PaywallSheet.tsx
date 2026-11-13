import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import { annualSavingPct, isPro, type Period, type StorePlatform, type Tier } from './entitlements';
import { chargeNote, continueLabel, planPrice, sheetBody, sheetTitle } from './copy';
import type { Plan } from './products';
import { foundingState, seatsLeftLabel, type FoundingSeats } from './seats';
import { Backdrop, Body, Fine, LegalLinks, OptionCard, PurchaseStateSheet, SheetTitle, usePurchaseFlow, useSheetTop, type Phase } from './ui';

type Props = {
  tier: Tier;
  freeLeft: number;
  seats: FoundingSeats | null;
  platform: StorePlatform;
  now: Date;
  /** A saved clip waits behind the purchase. */
  queued?: boolean;
  initialPeriod?: Period;
  initialPhase?: Phase;
  priceFor?: (plan: Plan) => string;
  savePct?: number;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  onNotNow: () => void;
  onRestore: () => void;
  onManage: () => void;
  onDone: () => void;
};

type Choice = 'pro' | 'founding';

function planOf(choice: Choice, period: Period): Plan {
  return choice === 'founding' ? { kind: 'founding' } : { kind: 'pro', period };
}

// The one paywall: Catchline Pro, monthly or annual, plus the founding seat while
// seats last. With this week's free videos used it says when they come back; an
// owner of any plan sees that they have Pro.
export default function PaywallSheet({
  tier,
  freeLeft,
  seats,
  platform,
  now,
  queued = false,
  initialPeriod = 'annual',
  initialPhase = 'choose',
  priceFor = planPrice,
  savePct = annualSavingPct(),
  purchase,
  onNotNow,
  onRestore,
  onManage,
  onDone,
}: Props) {
  const { height } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [choice, setChoice] = useState<Choice>('pro');
  const flow = usePurchaseFlow(purchase, initialPhase);
  const plan = planOf(choice, period);
  const shownPlan = flow.plan ?? plan;
  const sheet = useSheetTop();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="paywall">
      <Backdrop sheetTop={sheet.top} />
      <Sheet gap={0} style={{ paddingBottom: space.s5 }} onLayout={sheet.onLayout} testID="paywall-sheet">
        {flow.phase !== 'choose' ? (
          <View style={{ paddingTop: space.s3 }}>
            <PurchaseStateSheet
              phase={flow.phase}
              plan={shownPlan}
              price={priceFor(shownPlan)}
              platform={platform}
              now={now}
              queued={queued}
              onDone={onDone}
              onRetry={() => flow.run(shownPlan)}
              onNotNow={onNotNow}
            />
          </View>
        ) : isPro(tier) ? (
          <View style={{ gap: space.s4, paddingTop: space.s3 }} testID="paywall-owned">
            <SheetTitle>{t('paywall.owned.title')}</SheetTitle>
            <Body>{t(tier === 'founding' ? 'paywall.owned.founding' : 'paywall.title')}</Body>
            <Btn onPress={onNotNow} testID="owned-done">
              {t('paywall.state.done')}
            </Btn>
            {tier === 'founding' ? null : (
              <Btn kind="text" onPress={onManage} testID="manage" style={{ alignSelf: 'center' }}>
                {t('paywall.owned.manage')}
              </Btn>
            )}
          </View>
        ) : (
          <ScrollView style={{ maxHeight: height * 0.88 }} contentContainerStyle={{ gap: space.s3, paddingTop: space.s2 }}>
            <SheetTitle>{sheetTitle(freeLeft)}</SheetTitle>
            <Body>{sheetBody(freeLeft, now)}</Body>
            <View style={{ alignItems: 'flex-end' }}>
              <Segmented
                testID="period"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: 'monthly', label: t('paywall.monthly') },
                  { value: 'annual', label: t('paywall.annualSave', { pct: savePct }) },
                ]}
              />
            </View>
            <View style={{ gap: space.s2 }}>
              <OptionCard selected={choice === 'pro'} onPress={() => setChoice('pro')} testID="plan-pro">
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, ...type.button }}>{t('paywall.pro')}</Text>
                  <Text style={{ color: colors.text2, ...type.small }}>{t('paywall.unlimited')}</Text>
                </View>
                <Price amount={priceFor(planOf('pro', period))} suffix={t(period === 'annual' ? 'paywall.perYr' : 'paywall.perMo')} />
              </OptionCard>
              {seats && foundingState(seats) !== 'soldOut' ? (
                <OptionCard selected={choice === 'founding'} onPress={() => setChoice('founding')} testID="plan-founding">
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, ...type.label, fontFamily: fontFamily.body }}>{t('paywall.founding')}</Text>
                    <Text testID="founding-seats" style={{ color: colors.text, ...type.readout }}>
                      {seatsLeftLabel(seats)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, ...type.label, fontFamily: fontFamily.bodyBold }}>
                    {t('paywall.priceOnce', { price: priceFor({ kind: 'founding' }) })}
                  </Text>
                </OptionCard>
              ) : null}
            </View>
            <Btn onPress={() => flow.run(plan)} testID="continue">
              {continueLabel(plan, priceFor(plan))}
            </Btn>
            <Fine center>{chargeNote(plan, queued)}</Fine>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Btn kind="text" onPress={onNotNow} testID="not-now">
                {t('paywall.notNow')}
              </Btn>
              <Btn kind="text" onPress={onRestore} testID="restore">
                {t('paywall.restore')}
              </Btn>
            </View>
            <LegalLinks />
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

function Price({ amount, suffix }: { amount: string; suffix: string }) {
  return (
    <Text style={[display(24), { color: colors.text }]}>
      {amount}
      {/* design-ok: mono suffix nested in display(24); the parent sets the line */}
      <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, letterSpacing: 0 }}>{suffix}</Text>
    </Text>
  );
}
