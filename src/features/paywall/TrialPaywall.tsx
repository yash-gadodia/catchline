import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import { PRICE_CENTS, TRIAL_DAYS, annualSavingPct, formatUsd, type Period, type StorePlatform } from './entitlements';
import { trialNote, trialOptionLine } from './copy';
import type { Plan } from './products';
import { Body, OptionCard, PurchaseStateSheet, usePurchaseFlow } from './ui';

// Ad-traffic funnel step 3: after the one free analysis, an annual-led 7-day trial.
export default function TrialPaywall({
  now,
  platform,
  webCheckout,
  purchase,
  onWeb,
  onDone,
  onClose,
}: {
  now: Date;
  platform: StorePlatform;
  webCheckout: boolean;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  onWeb: (period: Period) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('annual');
  const flow = usePurchaseFlow(purchase);
  const plan: Plan = { kind: 'sub', tier: 'pull', period, trial: true };

  return (
    <View
      testID="trial-paywall"
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space.s6,
        paddingBottom: insets.bottom + space.s5,
        paddingHorizontal: space.gutter,
      }}
    >
      {flow.phase !== 'choose' ? (
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <PurchaseStateSheet
            phase={flow.phase}
            plan={flow.plan ?? plan}
            price={formatUsd(PRICE_CENTS.pull[period])}
            platform={platform}
            now={now}
            onWatch={onDone}
            onRetry={() => flow.run(plan)}
            onNotNow={onClose}
          />
        </View>
      ) : (
        <>
          <SmallCaps>{t('paywall.trial.ready')}</SmallCaps>
          <Text style={[display(34), { color: colors.text, marginTop: space.s3, marginBottom: space.s4 }]}>
            {t('paywall.trial.title', { days: TRIAL_DAYS })}
          </Text>
          <View style={{ gap: space.s3 }}>
            {(['annual', 'monthly'] as const).map((p) => (
              <OptionCard key={p} selected={period === p} onPress={() => setPeriod(p)} testID={`trial-${p}`}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, ...type.label, fontFamily: fontFamily.bodyBold }}>
                    {p === 'annual' ? t('paywall.annual') : t('paywall.monthly')}
                  </Text>
                  <Text style={{ color: colors.text2, ...type.small }}>
                    {trialOptionLine(p)}
                  </Text>
                </View>
                {p === 'annual' ? (
                  <Text style={{ color: colors.text, ...type.caption }}>
                    {t('paywall.save', { pct: annualSavingPct('pull') })}
                  </Text>
                ) : null}
              </OptionCard>
            ))}
          </View>
          <View style={{ marginTop: space.s4 }}>
            <Body>{trialNote(period, now)}</Body>
          </View>
          <View style={{ flex: 1 }} />
          <Btn onPress={() => flow.run(plan)} testID="start-trial">
            {t('paywall.trial.start')}
          </Btn>
          {webCheckout ? (
            <Btn kind="text" onPress={() => onWeb(period)} testID="pay-web" style={{ alignSelf: 'center', marginTop: space.s3 }}>
              {t('paywall.trial.web')}
            </Btn>
          ) : null}
        </>
      )}
    </View>
  );
}
