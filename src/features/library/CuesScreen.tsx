import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { backendEnabled } from '../../data/backend';
import { syncLibrary } from '../../data/library';
import { agoLabel, bestOf, cueWindow, pastCueSummary, seriesFor, sessionsCounter, shortDate, STATUS_LABEL, trendDirection } from './derive';
import { metricFor, SINGULAR_MOVEMENT } from './metrics';
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
  const { cues, sessions, today, synced } = useLibrary();
  const { refreshing, onRefresh } = useRefresh();
  const trying = cues.filter((c) => c.status === 'trying');
  const past = cues.filter((c) => c.status !== 'trying');
  const top = { paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter };

  if (cues.length === 0) {
    const loading = backendEnabled() && !synced;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[top, { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} testID="cues-refresh" />}
        testID={loading ? 'cues-loading' : 'cues-empty'}
      >
        <Title>Cues</Title>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
          {loading ? (
            <ActivityIndicator color={colors.text2} />
          ) : (
            <>
              <Image testID="cues-empty-art" source={EMPTY_CUES_ART} style={{ width: 160, height: 160 }} />
              <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>Your first cue lands here.</Text>
              <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>
                After you film a lift, the one thing to fix lives on this tab until it sticks.
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
      <Title>Cues</Title>
      {trying.map((c) => (
        <ActiveCue key={c.id} cue={c} sessions={sessions} today={today} onOpen={() => onOpen(c)} />
      ))}
      {past.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ paddingTop: space.s4, paddingBottom: space.s1 }}>
            <SmallCaps size={12}>Past cues</SmallCaps>
          </View>
          {past.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => onOpen(c)}
              testID={`past-${c.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.s3,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.hairline,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.status === 'dropped' ? colors.text2 : colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>
                  {c.text}
                </Text>
                <Text style={{ color: c.status === 'dropped' ? colors.text3 : colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
                  {`${SINGULAR_MOVEMENT[c.movement]} · ${pastCueSummary(c, sessions)} · ${agoLabel(c.endedAt ?? c.givenAt, today)}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StatusDot status={c.status} />
                <Text style={{ color: c.status === 'dropped' ? colors.text2 : colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18 }}>
                  {STATUS_LABEL[c.status]}
                </Text>
              </View>
            </Pressable>
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
          <SmallCaps size={12} color={colors.text}>{`Trying · ${SINGULAR_MOVEMENT[cue.movement]}`}</SmallCaps>
        </View>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
          {`${sessionsCounter(cue, sessions)} sessions · ${agoLabel(cue.givenAt, today)}`}
        </Text>
      </View>
      <Text style={[display(32), { color: colors.text }]}>{cue.text}</Text>
      {series.length > 1 ? (
        <TrendChart
          testID="cue-sparkline"
          series={series}
          width={width - space.gutter * 2}
          height={80}
          best={best?.value}
          markerIndex={markerIndex}
          markerLabel={`cue · ${shortDate(cue.givenAt).toLowerCase()}`}
        />
      ) : null}
      <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
        {`${metricFor(cue.metricId).caption} ${trendDirection(series.slice(markerIndex ?? 0), cue.metricId)}`.trim()}
      </Text>
    </Pressable>
  );
}
