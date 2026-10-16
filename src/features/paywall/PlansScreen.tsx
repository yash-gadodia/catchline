import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, radius, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import {
  FOUNDING_PRICE_CENTS,
  FREE_VIDEOS,
  PRICE_CENTS,
  TABLE_TIERS,
  comparisonRows,
  formatUsd,
  tierName,
  type Cell,
  type TableTier,
  type Tier,
} from './entitlements';
import { longDate } from './copy';
import { t } from '../../i18n';

function short(tier: TableTier): string {
  if (tier === 'free') return tierName('free');
  return tier === 'founding' ? t('paywall.plans.founding') : tierName('pull');
}

function priceLines(tier: TableTier): [string, string] {
  if (tier === 'free') return ['$0', ''];
  if (tier === 'founding') return [formatUsd(FOUNDING_PRICE_CENTS), t('paywall.plans.once')];
  return [formatUsd(PRICE_CENTS[tier].monthly), `${formatUsd(PRICE_CENTS[tier].annual)}${t('paywall.perYr')}`];
}

export function currentPlanLine(tier: Tier, renews: Date | null): { name: string; meta: string } {
  if (tier === 'founding') return { name: `${tierName('pull')} · ${tierName('founding')}`, meta: t('paywall.plans.forLife') };
  if (tier === 'free') return { name: tierName('free'), meta: t('paywall.plans.freeMeta', { count: FREE_VIDEOS.organic }) };
  return { name: tierName(tier), meta: renews ? t('paywall.plans.renews', { date: longDate(renews) }) : '' };
}

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === 'dot') {
    return <View testID="cell-dot" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text }} />;
  }
  return (
    <Text
      style={{
        color: cell.kind === 'none' ? colors.text3 : colors.text,
        fontFamily: fontFamily.mono,
        // design-ok: 11pt table cell, four tiers must fit the phone width
        fontSize: 11, lineHeight: 16,
        textAlign: 'center',
      }}
    >
      {cell.kind === 'none' ? '–' : cell.text}
    </Text>
  );
}

export default function PlansScreen({
  current,
  renews,
  onBack,
  onChangePlan,
}: {
  current: Tier;
  renews: Date | null;
  onBack: () => void;
  onChangePlan: () => void;
}) {
  const insets = useSafeAreaInsets();
  const rows = comparisonRows();
  const col = (t: TableTier) => ({
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.s3,
    backgroundColor: t === current ? colors.surface2 : 'transparent',
  });
  const line = currentPlanLine(current, renews);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="plans">
      <TopBar
        back={t('paywall.plans.back')}
        onBack={onBack}
        more={false}
        center={
          <Text style={{ color: colors.text, ...type.button }}>{t('paywall.plans.title')}</Text>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.5 }} />
          {TABLE_TIERS.map((t) => (
            <View key={t} style={col(t)} testID={t === current ? `col-current-${t}` : undefined}>
              <Text
                style={{
                  color: t === current ? colors.text : colors.text2,
                  fontFamily: t === current ? fontFamily.monoMedium : fontFamily.mono,
                  // design-ok: 11pt column head, four tiers must fit the phone width
                  fontSize: 11, lineHeight: 16,
                }}
              >
                {short(t)}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <View style={{ flex: 1.5, justifyContent: 'center', paddingVertical: space.s3 }}>
              <Text style={{ color: colors.text, ...type.small }}>{r.label}</Text>
            </View>
            {TABLE_TIERS.map((t) => (
              <View key={t} style={col(t)}>
                <CellView cell={r.cells[t]} />
              </View>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ flex: 1.5, justifyContent: 'center', paddingVertical: space.s3 }}>
            <Text style={{ color: colors.text, ...type.small }}>{t('paywall.plans.price')}</Text>
          </View>
          {TABLE_TIERS.map((t) => {
            const [a, b] = priceLines(t);
            return (
              <View key={t} style={col(t)}>
                {/* design-ok: 10pt price lines, four tiers must fit the phone width */}
                <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 14 }}>{a}</Text>
                {b ? (
                  // design-ok: 10pt price lines, four tiers must fit the phone width
                  <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 14 }}>{b}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <View
          testID="current-plan"
          style={{
            marginTop: space.s4,
            borderWidth: 1,
            borderColor: colors.text,
            borderRadius: radius.control,
            paddingVertical: space.s3,
            paddingHorizontal: space.s3,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: space.s2,
          }}
        >
          <Text style={{ color: colors.text, ...type.small }}>
            {t('paywall.plans.current')}
            <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold }}>{line.name}</Text>
          </Text>
          <Text style={{ color: colors.text2, ...type.caption }}>{line.meta}</Text>
        </View>
        <Btn kind="secondary" onPress={onChangePlan} testID="change-plan" style={{ marginTop: space.s6 }}>
          {current === 'free' ? t('paywall.seePlans') : t('paywall.plans.change')}
        </Btn>
      </ScrollView>
    </View>
  );
}
