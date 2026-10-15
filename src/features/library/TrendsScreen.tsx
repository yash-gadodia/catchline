import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import type { Movement } from '../../analysis/types';
import { fmt, movementLabel, plural } from '../../analysis/format';
import Segmented from '../../components/Segmented';
import SmallCaps from '../../components/SmallCaps';
import { backendEnabled } from '../../data/backend';
import { colors, radius, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { defaultMovement, measuredMetrics, measuredMovements, metricFor, PLURAL_MOVEMENT, PRIMARY_METRIC, SINGULAR_MOVEMENT } from './metrics';
import { bestOf, inRange, latestCue, metricText, seriesFor, shortDate, trendRecap, type Range } from './derive';
import { useLibrary } from './repository';
import { useRefresh } from './CuesScreen';
import TrendChart from './TrendChart';
import FadeRow from '../analysis/FadeRow';
import { Chip, Frame, Title } from './ui';

const EMPTY_TRENDS_ART = require('../../../assets/art/empty-trends.png');

export default function TrendsScreen({ initialMovement }: { initialMovement?: Movement }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sessions, cues, today, synced } = useLibrary();
  const { refreshing, onRefresh } = useRefresh();
  // Only movements the account has analysed lifts for; the one with the most lifts opens first.
  const movements = measuredMovements(sessions);
  const [movement, setMovement] = useState<Movement>(initialMovement ?? defaultMovement(sessions));
  const [menu, setMenu] = useState(false);
  const cueFor = latestCue(cues, movement);
  const [metricId, setMetricId] = useState(cueFor?.metricId ?? '');
  const [range, setRange] = useState<Range>(30);
  const chips = measuredMetrics(sessions, movement);
  const metric = metricFor(chips.includes(metricId) ? metricId : (chips[0] ?? PRIMARY_METRIC[movement]));
  const count = sessions.filter((s) => s.movement === movement).length;
  const loading = backendEnabled() && !synced && sessions.length === 0;

  const pick = (m: Movement) => {
    setMovement(m);
    setMenu(false);
    setMetricId(latestCue(cues, m)?.metricId ?? '');
  };

  const switcher =
    movements.length > 0 ? (
      <Pressable
        onPress={() => setMenu(!menu)}
        testID="movement-switcher"
        accessibilityRole="button"
        style={{
          height: 36,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s2,
          borderWidth: 1,
          borderColor: colors.text,
          borderRadius: radius.control,
        }}
      >
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>{movementLabel(movement)}</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>⌄</Text>
      </Pressable>
    ) : null;

  const all = seriesFor(sessions, movement, metric.id);
  const visible = inRange(all, today, range);
  const best = bestOf(all, metric.id);
  const pinnedId = chips.includes(PRIMARY_METRIC[movement]) ? PRIMARY_METRIC[movement] : metric.id;
  const pinned = bestOf(seriesFor(sessions, movement, pinnedId), pinnedId);
  // One marker per cue started on this measurement, at the session it was given.
  const markers = cues
    .filter((c) => c.movement === movement && c.metricId === metric.id)
    .map((c) => ({ index: visible.reduce((idx, p, i) => (p.date <= c.givenAt ? i : idx), -1), label: `cue · ${shortDate(c.givenAt).toLowerCase()}` }))
    .filter((m) => m.index >= 0);
  const recap = trendRecap(metric.id, all, today, cueFor, sessions);
  const latest = visible[visible.length - 1];
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} />;

  const sparse = (headline: string, body: string, testID: string, art = false) => (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refresh} testID={testID}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s4, paddingHorizontal: space.gutter }}>
        {art ? (
          <Image testID="trends-empty-art" source={EMPTY_TRENDS_ART} style={{ width: 160, height: 160 }} />
        ) : (
          <Svg width={200} height={60}>
            <Line x1={0} y1={50} x2={200} y2={50} stroke={colors.text} strokeDasharray="4 6" opacity={0.35} />
            {count === 1 ? <Circle cx={40} cy={22} r={5} fill={colors.flare} /> : null}
            <Circle cx={100} cy={30} r={3} stroke={colors.text3} strokeDasharray="2 2" fill="none" />
            <Circle cx={160} cy={30} r={3} stroke={colors.text3} strokeDasharray="2 2" fill="none" />
          </Svg>
        )}
        <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>{headline}</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>{body}</Text>
      </View>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s3 }} testID="trends">
      <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
        <Title>Trends</Title>
        {switcher}
      </View>
      {menu ? (
        <View
          testID="movement-menu"
          style={{
            position: 'absolute',
            top: insets.top + space.s3 + 44,
            right: space.gutter,
            zIndex: 3,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.hairline,
            borderRadius: radius.control,
            paddingVertical: space.s1,
            minWidth: 200,
          }}
        >
          {movements.map((m) => (
            <Pressable key={m} onPress={() => pick(m)} testID={`pick-${m}`} style={{ paddingVertical: 10, paddingHorizontal: space.s4 }}>
              <Text style={{ color: m === movement ? colors.text : colors.text2, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>
                {movementLabel(m)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} testID="trends-loading">
          <ActivityIndicator color={colors.text2} />
        </View>
      ) : movements.length === 0 && !initialMovement ? (
        sparse('Film a lift and the trend starts here.', 'Trends need two lifts of the same movement.', 'trends-empty', true)
      ) : count < 2 ? (
        sparse(
          count === 1 ? `One ${SINGULAR_MOVEMENT[movement]} so far.` : `No ${PLURAL_MOVEMENT[movement]} yet.`,
          count === 1 ? 'Trends need two lifts of the same movement. Film the next one and this fills in.' : 'Film one and it starts here. Trends need two lifts of the same movement.',
          'trends-sparse'
        )
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s6 }} refreshControl={refresh}>
          <View style={{ gap: space.s4, paddingTop: space.s4 }}>
            {pinned ? (
              <View
                testID="pinned-best"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingVertical: space.s3, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline }}
              >
                <Frame image={pinned.session.thumb} width={48} height={60} gray />
                <View style={{ flex: 1, gap: 2 }}>
                  <SmallCaps size={12}>Best rep · pinned</SmallCaps>
                  <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>
                    {[
                      pinned.session.loadKg != null ? `${fmt(pinned.session.loadKg)} kg` : null,
                      shortDate(pinned.date),
                      `${metricFor(pinnedId).short} ${metricText(pinnedId, pinned.value)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={{ marginHorizontal: -space.gutter }}>
            <FadeRow testID="metric-chips" contentContainerStyle={{ gap: 6, paddingHorizontal: space.gutter }}>
              {chips.map((id) => (
                <Chip key={id} label={metricFor(id).label} height={36} selected={id === metric.id} onPress={() => setMetricId(id)} testID={`metric-${id}`} />
              ))}
            </FadeRow>
            </View>
          </View>
          <View style={{ paddingTop: space.s5, gap: space.s3 }}>
            {recap ? (
              <Text testID="trend-recap" style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
                {recap}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={[display(56, true), { color: colors.text }]} testID="trend-hero">
                {latest ? metricText(metric.id, latest.value) : '–'}
              </Text>
              <Segmented
                mono
                testID="range"
                value={String(range) as '7' | '30' | '90'}
                onChange={(v) => setRange(Number(v) as Range)}
                options={[
                  { value: '7', label: '7d' },
                  { value: '30', label: '30d' },
                  { value: '90', label: '90d' },
                ]}
              />
            </View>
            {visible.length > 1 ? (
              <TrendChart
                testID="trend-chart"
                series={visible}
                width={width - space.gutter * 2}
                height={200}
                best={best?.value}
                markers={markers}
                showDates
              />
            ) : (
              <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }} testID="range-sparse">
                {`${visible.length === 1 ? 'One session' : 'No sessions'} in the last ${range} days. Try a longer range.`}
              </Text>
            )}
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
              {`${metric.caption} ${metric.lowerIsBetter ? 'Lower' : 'Higher'} is better. ${plural(visible.length, 'session')}.`}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
