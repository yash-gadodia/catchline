import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, radius, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import {
  FOUNDING_PRICE_CENTS,
  PRICE_CENTS,
  TABLE_TIERS,
  TIER_NAME,
  comparisonRows,
  formatUsd,
  type Cell,
  type TableTier,
  type Tier,
} from './entitlements';
import { longDate } from './copy';

const SHORT: Record<TableTier, string> = { free: 'Free', pull: 'Pull', founding: 'Founding' };

function priceLines(t: TableTier): [string, string] {
  if (t === 'free') return ['$0', ''];
  if (t === 'founding') return [formatUsd(FOUNDING_PRICE_CENTS), 'once'];
  return [formatUsd(PRICE_CENTS[t].monthly), `${formatUsd(PRICE_CENTS[t].annual)}/yr`];
}

export function currentPlanLine(tier: Tier, renews: Date | null): { name: string; meta: string } {
  if (tier === 'founding') return { name: 'Pull · Founding member', meta: 'for life' };
  if (tier === 'free') return { name: 'Free', meta: '3 videos for life' };
  return { name: TIER_NAME[tier], meta: renews ? `renews ${longDate(renews)}` : '' };
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
        fontSize: 11,
        lineHeight: 16,
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
        back="You"
        onBack={onBack}
        more={false}
        center={
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Plans</Text>
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
                  fontSize: 11,
                  lineHeight: 16,
                }}
              >
                {SHORT[t]}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <View style={{ flex: 1.5, justifyContent: 'center', paddingVertical: space.s3 }}>
              <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>{r.label}</Text>
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
            <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>Price</Text>
          </View>
          {TABLE_TIERS.map((t) => {
            const [a, b] = priceLines(t);
            return (
              <View key={t} style={col(t)}>
                <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 14 }}>{a}</Text>
                {b ? (
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
          <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>
            {'Current plan: '}
            <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold }}>{line.name}</Text>
          </Text>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>{line.meta}</Text>
        </View>
        <Btn kind="secondary" onPress={onChangePlan} testID="change-plan" style={{ marginTop: space.s6 }}>
          {current === 'free' ? 'See plans' : 'Change plan'}
        </Btn>
      </ScrollView>
    </View>
  );
}
