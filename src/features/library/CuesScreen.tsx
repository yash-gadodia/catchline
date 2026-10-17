import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Row from '../../components/Row';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { backendEnabled } from '../../data/backend';
import { syncLibrary } from '../../data/library';
import { agoLabel, bestOf, cueWindow, pastCueSummary, seriesFor, sessionsCounter, shortDate, statusLabel, trendDirection } from './derive';
import { metricFor, singularMovement } from './metrics';
import { t } from '../../i18n';
import { cueText } from '../../i18n/cues';
import { useLibrary } from './repository';
import TrendChart from './TrendChart';
import type { CueRecord, Day, Session } from './types';
import { StatusDot, Title } from './ui';

// Pull-to-refresh re-reads cues, lifts and analyses from the server (a no-op in dev mode).
export function useRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    if (!backendEnabled()) return;
    setRefreshing(true);
    syncLibrary()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}

const EMPTY_CUES_ART = require('../../../assets/art/empty-cues.png');

export default function CuesScreen({ onOpen }: { onOpen: (cue: CueRecord) => void }) {
  const insets = useSafeAreaInsets();
  const { cues, lifts, sessions, today, synced } = useLibrary();
  const { refreshing, onRefresh } = useRefresh();
  const trying = cues.filter((c) => c.status === 'trying');
  const past = cues.filter((c) => c.status !== 'trying');
  const top = { paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter };

  if (cues.length === 0) {
    const loading = backendEnabled() && !synced;
    // A lifter whose lifts all came back clean has already filmed; tell them why the tab is empty (#18).
    const clean = lifts.some((l) => l.status === 'done');
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[top, { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} testID="cues-refresh" />}
        testID={loading ? 'cues-loading' : 'cues-empty'}
      >
        <Title>{t('library.tabs.cues')}</Title>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
          {loading ? (
            <ActivityIndicator color={colors.text2} />
          ) : (
            <>
              <Image testID="cues-empty-art" source={EMPTY_CUES_ART} style={{ width: 160, height: 160, tintColor: colors.text2 }} />
              <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>
                {t(clean ? 'library.cues.cleanTitle' : 'library.cues.emptyTitle')}
              </Text>
              <Text style={{ color: colors.text2, ...type.callout, textAlign: 'center' }}>
                {t(clean ? 'library.cues.cleanBody' : 'library.cues.emptyBody')}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[top, { paddingBottom: space.s6, gap: space.s5 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} testID="cues-refresh" />}
      testID="cues"
    >
      <Title>{t('library.tabs.cues')}</Title>
      {trying.map((c) => (
        <ActiveCue key={c.id} cue={c} sessions={sessions} today={today} onOpen={() => onOpen(c)} />
      ))}
      {past.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ paddingTop: space.s4, paddingBottom: space.s1 }}>
            <SmallCaps size={12}>{t('library.cues.past')}</SmallCaps>
          </View>
          {past.map((c) => (
            <Row key={c.id} onPress={() => onOpen(c)} testID={`past-${c.id}`} style={{ paddingVertical: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.status === 'dropped' ? colors.text2 : colors.text, ...type.button }}>
                  {cueText(c.metricId, c.text)}
                </Text>
                <Text style={{ color: c.status === 'dropped' ? colors.text3 : colors.text2, ...type.readout }}>
                  {`${singularMovement(c.movement)} · ${pastCueSummary(c, sessions)} · ${agoLabel(c.endedAt ?? c.givenAt, today)}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StatusDot status={c.status} />
                <Text style={{ color: c.status === 'dropped' ? colors.text2 : colors.text, ...type.readout, fontFamily: fontFamily.bodyMedium }}>
                  {statusLabel(c.status)}
                </Text>
              </View>
            </Row>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ActiveCue({ cue, sessions, today, onOpen }: { cue: CueRecord; sessions: Session[]; today: Day; onOpen: () => void }) {
  const { width } = useWindowDimensions();
  const { series, markerIndex } = cueWindow(cue, sessions);
  const best = bestOf(seriesFor(sessions, cue.movement, cue.metricId), cue.metricId);
  return (
    <Pressable onPress={onOpen} style={{ gap: space.s3 }} testID={`active-${cue.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <StatusDot status="trying" />
          <SmallCaps size={12} color={colors.text}>{t('library.cues.tryingKicker', { movement: singularMovement(cue.movement) })}</SmallCaps>
        </View>
        <Text style={{ color: colors.text2, ...type.readout }}>
          {t('library.cues.sessionsAgo', { counter: sessionsCounter(cue, sessions), ago: agoLabel(cue.givenAt, today) })}
        </Text>
      </View>
      <Text style={[display(32), { color: colors.text }]}>{cueText(cue.metricId, cue.text)}</Text>
      {series.length > 1 ? (
        <TrendChart
          testID="cue-sparkline"
          series={series}
          width={width - space.gutter * 2}
          height={80}
          best={best?.value}
          markerIndex={markerIndex}
          markerLabel={t('library.trends.cueMarker', { date: shortDate(cue.givenAt).toLowerCase() })}
        />
      ) : null}
      <Text style={{ color: colors.text2, ...type.callout }}>
        {`${metricFor(cue.metricId).caption} ${trendDirection(series.slice(markerIndex ?? 0), cue.metricId)}`.trim()}
      </Text>
    </Pressable>
  );
}
