import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import { FREE_VIDEOS, annualSavingPct, tierName, type Period, type StorePlatform } from './entitlements';
import { chargeNote, continueLabel, planPrice, pullSummary } from './copy';
import { cueStatusLabel, type ProofCue } from './proofCues';
import type { Plan } from './products';
import { foundingState, seatsLeftLabel, type FoundingSeats } from './seats';
import { Backdrop, Fine, OptionCard, PurchaseStateSheet, Row, SheetTitle, StatusDot, usePurchaseFlow, useSheetTop, type Phase } from './ui';

type Props = {
  cues: ProofCue[];
  seats: FoundingSeats | null;
  platform: StorePlatform;
  now: Date;
  queuedMovement?: string;
  initialPeriod?: Period;
  initialPhase?: Phase;
  priceFor?: (plan: Plan) => string;
  savePct?: number;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  onNotNow: () => void;
  onRestore: () => void;
  onWatch: () => void;
};

type Choice = 'pull' | 'founding';

function planOf(choice: Choice, period: Period): Plan {
  return choice === 'founding' ? { kind: 'founding' } : { kind: 'sub', tier: 'pull', period };
}

// Video 4: the clip is already saved, the sheet rises over Review, and the proof is the
// lifter's own cues. One plan, Pull, preselected on annual, plus the founding seat.
export default function PaywallSheet({
  cues,
  seats,
  platform,
  now,
  queuedMovement,
  initialPeriod = 'annual',
  initialPhase = 'choose',
  priceFor = planPrice,
  savePct = annualSavingPct('pull'),
  purchase,
  onNotNow,
  onRestore,
  onWatch,
}: Props) {
  const { height } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [choice, setChoice] = useState<Choice>('pull');
  const flow = usePurchaseFlow(purchase, initialPhase);
  const plan = planOf(choice, period);
  const founding = seats ? foundingState(seats) : 'soldOut';
  const shownPlan = flow.plan ?? plan;
  const sheet = useSheetTop();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="paywall">
      <Backdrop art="catch" sheetTop={sheet.top} />
      <Sheet gap={0} style={{ paddingBottom: space.s5 }} onLayout={sheet.onLayout} testID="paywall-sheet">
        {flow.phase !== 'choose' ? (
          <View style={{ paddingTop: space.s3 }}>
            <PurchaseStateSheet
              phase={flow.phase}
              plan={shownPlan}
              price={priceFor(shownPlan)}
              platform={platform}
              now={now}
              queuedMovement={queuedMovement}
              onWatch={onWatch}
              onRetry={() => flow.run(shownPlan)}
              onNotNow={onNotNow}
            />
          </View>
        ) : (
          <ScrollView style={{ maxHeight: height * 0.88 }} contentContainerStyle={{ gap: space.s3, paddingTop: space.s2 }}>
            <SheetTitle>{t('paywall.sheet.title', { count: FREE_VIDEOS.organic })}</SheetTitle>
            {cues.length > 0 ? (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }} testID="proof-cues">
                {cues.slice(0, 3).map((c, i, all) => (
                  <Row key={c.text} last={i === all.length - 1}>
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}
                    >
                      {c.text}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={c.status} />
                      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18 }}>
                        {cueStatusLabel(c)}
                      </Text>
                    </View>
                  </Row>
                ))}
              </View>
            ) : null}
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
              <OptionCard selected={choice === 'pull'} onPress={() => setChoice('pull')} testID="tier-pull">
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>
                    {tierName('pull')}
                  </Text>
                  <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>
                    {pullSummary()}
                  </Text>
                </View>
                <Price amount={priceFor(planOf('pull', period))} suffix={t(period === 'annual' ? 'paywall.perYr' : 'paywall.perMo')} />
              </OptionCard>
              {seats && founding !== 'soldOut' ? (
                <OptionCard selected={choice === 'founding'} onPress={() => setChoice('founding')} testID="tier-founding">
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}>
                      {t('paywall.sheet.founding')}
                    </Text>
                    <Text
                      testID="founding-seats"
                      style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}
                    >
                      {seatsLeftLabel(seats)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 15, lineHeight: 20 }}>
                    {t('paywall.priceOnce', { price: priceFor({ kind: 'founding' }) })}
                  </Text>
                </OptionCard>
              ) : null}
            </View>
            <Btn onPress={() => flow.run(plan)} testID="continue">
              {continueLabel(plan, priceFor(plan))}
            </Btn>
            <Fine center>{chargeNote(plan, !!queuedMovement)}</Fine>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Btn kind="text" onPress={onNotNow} testID="not-now">
                {queuedMovement ? t('paywall.notNowQueued') : t('paywall.notNow')}
              </Btn>
              <Btn kind="text" onPress={onRestore} testID="restore">
                {t('paywall.restore')}
              </Btn>
            </View>
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

export function Price({ amount, suffix }: { amount: string; suffix: string }) {
  return (
    <Text style={[display(24), { color: colors.text }]}>
      {amount}
      <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, letterSpacing: 0 }}>{suffix}</Text>
    </Text>
  );
}
