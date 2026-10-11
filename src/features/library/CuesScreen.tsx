import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { bestOf, cueWindow, pastCueSummary, seriesFor, sessionsCounter, shortDate, STATUS_LABEL, trendDirection } from './derive';
import { METRICS, SINGULAR_MOVEMENT } from './metrics';
import { useLibrary } from './repository';
import TrendChart from './TrendChart';
import type { CueRecord, Session } from './types';
import { StatusDot, Title } from './ui';

export default function CuesScreen({ onOpen }: { onOpen: (cue: CueRecord) => void }) {
  const insets = useSafeAreaInsets();
  const { cues, sessions } = useLibrary();
  const trying = cues.filter((c) => c.status === 'trying');
  const past = cues.filter((c) => c.status !== 'trying');

  if (cues.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter }} testID="cues-empty">
        <Title>Cues</Title>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
          <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>Your first cue lands here.</Text>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>
            After you film a lift, the one thing to fix lives on this tab until it sticks.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter, paddingBottom: space.s6, gap: space.s5 }}
      testID="cues"
    >
      <Title>Cues</Title>
      {trying.map((c) => (
        <ActiveCue key={c.id} cue={c} sessions={sessions} onOpen={() => onOpen(c)} />
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
                  {pastCueSummary(c, sessions)}
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

function ActiveCue({ cue, sessions, onOpen }: { cue: CueRecord; sessions: Session[]; onOpen: () => void }) {
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
          {`${sessionsCounter(cue, sessions)} sessions`}
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
        {`${METRICS[cue.metricId].caption} ${trendDirection(series.slice(markerIndex ?? 0), cue.metricId)}`.trim()}
      </Text>
    </Pressable>
  );
}
