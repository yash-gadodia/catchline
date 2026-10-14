import { useEffect, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { ANALYSES } from '../../analysis/fixtures';
import { fmt } from '../../analysis/format';
import { liveAnalysis } from '../../analysis/live';
import type { Analysis } from '../../analysis/types';
import Btn from '../../components/Btn';
import WhyDrawer from '../analysis/WhyDrawer';
import Readout from '../../components/Readout';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { lightTick, success } from '../../lib/haptics';
import {
  bestOf,
  cueChange,
  cueLifts,
  cueSeries,
  cueWindow,
  didntStickHeadline,
  liftDetail,
  liftTitle,
  metricText,
  seriesFor,
  sessionsCounter,
  shortDate,
  STATUS_LABEL,
} from './derive';
import { metricFor, SINGULAR_MOVEMENT } from './metrics';
import { useLibrary } from './repository';
import TrendChart from './TrendChart';
import type { CueRecord, Day, Lift, Session } from './types';
import { DestructiveBtn, Frame, StatusDot, Underlined } from './ui';

function pointLabel(day: Day, today: Day, metricId: string, value: number) {
  return `${day === today ? 'today' : shortDate(day).toLowerCase()} · ${metricText(metricId, value)}`;
}

export type CueDetailNav = { onBack: () => void; onStuck: () => void; onDidntStick: () => void; onDrop: () => void };

// The lift's analysis when the app has it (Analysis.id = lift id); never the demo.
function analysisForLift(id: string | undefined): Analysis | undefined {
  return id ? (liveAnalysis(id) ?? ANALYSES[id]) : undefined;
}

function cueLiftDetail(l: Lift, cue: CueRecord, sessions: Session[]): string {
  if (l.status === 'done') {
    const value = sessions.find((s) => s.liftId === l.id)?.values[cue.metricId];
    return value == null ? 'analysed' : `${metricFor(cue.metricId).short} ${metricText(cue.metricId, value)}`;
  }
  return liftDetail(l, sessions);
}

export default function CueDetailScreen({ cue, nav }: { cue: CueRecord; nav: CueDetailNav }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sessions, lifts, today } = useLibrary();
  const [why, setWhy] = useState(false);
  const series = cueSeries(cue, sessions);
  const first = series[0];
  const last = series[series.length - 1];
  const { series: chart, markerIndex } = cueWindow(cue, sessions);
  const best = bestOf(seriesFor(sessions, cue.movement, cue.metricId), cue.metricId);
  const metric = metricFor(cue.metricId);
  const fed = cueLifts(cue, lifts);
  const analysis = analysisForLift(cue.lastLiftId) ?? analysisForLift(cue.firstLiftId);
  const half = (width - 2) / 2;
  const status = cue.status === 'trying' ? `Trying · ${sessionsCounter(cue, sessions)}` : STATUS_LABEL[cue.status];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="cue-detail">
      <TopBar
        back="Cues"
        onBack={nav.onBack}
        center={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <StatusDot status={cue.status} />
            <SmallCaps size={12} color={colors.text}>{status}</SmallCaps>
          </View>
        }
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.s4 }}>
      <View style={{ paddingTop: space.s2, paddingBottom: space.s4, paddingHorizontal: space.gutter, gap: space.s3 }}>
        <Text style={[display(36), { color: colors.text }]}>{cue.text}</Text>
        {cue.why ? (
          <View style={{ gap: space.s1 }}>
            <SmallCaps size={11}>AI estimate</SmallCaps>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }} testID="cue-why">
              {cue.why}
            </Text>
          </View>
        ) : null}
        {analysis ? (
          <Underlined onPress={() => setWhy(true)} testID="cue-why-open">
            Why this?
          </Underlined>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }} testID="before-after">
        <Frame image={cue.before.image} width={half} height={220} gray zoom={1.25} focus={{ x: 0.52, y: 0.32 }}>
          {first ? (
            <Readout style={{ position: 'absolute', left: 10, top: 10 }} size={12} testID="before-readout">
              {pointLabel(first.date, today, cue.metricId, first.value)}
            </Readout>
          ) : null}
        </Frame>
        <Frame image={cue.after.image} width={half} height={220} zoom={1.25} focus={{ x: 0.5, y: 0.32 }}>
          {last && last !== first ? (
            <Readout style={{ position: 'absolute', left: 10, top: 10 }} size={12} color={colors.flare} testID="after-readout">
              {pointLabel(last.date, today, cue.metricId, last.value)}
            </Readout>
          ) : null}
        </Frame>
      </View>
      <View style={{ paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>{metric.label}</Text>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
            {`${metric.unit} · ${chart.length} sessions measured`}
          </Text>
        </View>
        {chart.length > 1 ? (
          <TrendChart
            testID="cue-chart"
            series={chart}
            width={width - space.gutter * 2}
            height={110}
            best={best?.value}
            markerIndex={markerIndex}
            markerLabel="cue given"
          />
        ) : null}
      </View>
      {fed.length > 0 ? (
        <View style={{ paddingTop: space.s5, paddingHorizontal: space.gutter }} testID="cue-lifts">
          <View style={{ paddingBottom: space.s1 }}>
            <SmallCaps size={12}>Lifts on this cue</SmallCaps>
          </View>
          {fed.map((l) => (
            <View
              key={l.id}
              testID={`cue-lift-${l.id}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s3, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>{liftTitle(l)}</Text>
                <Text numberOfLines={1} style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
                  {cueLiftDetail(l, cue, sessions)}
                </Text>
              </View>
              <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>{shortDate(l.date).toLowerCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}
      </ScrollView>
      {cue.status === 'trying' ? (
        <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7), gap: space.s3 }}>
          <Btn onPress={nav.onStuck} testID="mark-stuck">
            It stuck
          </Btn>
          <DestructiveBtn onPress={nav.onDidntStick} testID="didnt-stick">
            Didn't stick
          </DestructiveBtn>
          <View style={{ alignItems: 'center' }}>
            <Underlined onPress={nav.onDrop} color={colors.text2} testID="drop-cue">
              Drop this cue
            </Underlined>
          </View>
        </View>
      ) : null}
      {why && analysis ? <WhyDrawer analysis={analysis} onClose={() => setWhy(false)} /> : null}
    </View>
  );
}

function usePop(index: number, reduce: boolean) {
  const v = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) v.value = withDelay(index * 140, withTiming(1, { duration: 180 }));
  }, [v, index, reduce]);
  return useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.94 + v.value * 0.06 }] }));
}

export type StuckNav = { onNext: () => void; onShare: () => void };

// "It stuck": four rising shutter pops (before, after, the word, the numbers).
export function StuckScreen({ cue, nav }: { cue: CueRecord; nav: StuckNav }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { sessions } = useLibrary();
  const reduce = useReducedMotion();
  const pops = [usePop(0, reduce), usePop(1, reduce), usePop(2, reduce), usePop(3, reduce)];
  useEffect(() => {
    if (reduce) {
      success();
      return;
    }
    const timers = [0, 1, 2].map((i) => setTimeout(() => lightTick(), i * 140));
    timers.push(setTimeout(() => success(), 3 * 140));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);
  const change = cueChange(cue, sessions);
  const series = cueSeries(cue, sessions);
  const metric = metricFor(cue.metricId);
  const half = (width - 2) / 2;
  const stageH = Math.round(Math.min(470, height * 0.5));
  const tick = (v: number) => Math.min(half * 0.4, Math.max(8, v * 8));
  const panel = (image: string, value: number | undefined, label: string, after: boolean, style: object) => (
    <Animated.View style={style}>
      <Frame image={image} width={half} height={stageH} gray={!after} opacity={after ? 1 : 0.6} focus={{ x: after ? 0.48 : 0.52, y: 0.4 }}>
        {value != null ? (
          <Svg width={half} height={stageH} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <Line x1={half * 0.47} y1={30} x2={half * 0.47} y2={stageH - 30} stroke={colors.text} strokeDasharray="2 5" opacity={0.5} />
            <Line
              x1={half * 0.47}
              y1={stageH * 0.4}
              x2={half * 0.47 + tick(value)}
              y2={stageH * 0.4}
              stroke={after ? colors.flare : colors.text}
              strokeWidth={2}
            />
          </Svg>
        ) : null}
        <Readout style={{ position: 'absolute', left: 12, bottom: 12 }} size={12} color={after ? colors.flare : colors.text}>
          {label}
        </Readout>
      </Frame>
    </Animated.View>
  );
  const first = series[0];
  const last = series[series.length - 1];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="stuck">
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {panel(cue.before.image, first?.value, first ? `${shortDate(first.date).toLowerCase()} · ${metricText(cue.metricId, first.value)}` : 'before', false, pops[0])}
        {panel(cue.after.image, last?.value, last ? `today · ${metricText(cue.metricId, last.value)}` : 'now', true, pops[1])}
      </View>
      <View style={{ flex: 1, paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s3 }}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }, pops[2]]}>
          <StatusDot status="stuck" />
          <SmallCaps color={colors.text}>{`Stuck · ${SINGULAR_MOVEMENT[cue.movement]}`}</SmallCaps>
        </Animated.View>
        <Animated.View style={pops[2]}>
          <Text style={[display(64, true), { color: colors.text }]}>Stuck.</Text>
        </Animated.View>
        <Animated.View style={pops[3]}>
          <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }} testID="stuck-summary">
            {change ? (
              <>
                {`${metric.label} `}
                <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 15, lineHeight: 24 }}>
                  {`${fmt(change.from)} → ${metricText(cue.metricId, change.to)}`}
                </Text>
                {` over ${change.weeks === 1 ? 'a week' : `${change.weeks} weeks`}. It's yours now.`}
              </>
            ) : (
              "You called it. It's yours now."
            )}
          </Text>
        </Animated.View>
      </View>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7), gap: space.s3 }}>
        <Btn onPress={nav.onNext} testID="next-cue">
          Next cue
        </Btn>
        <Btn kind="secondary" onPress={nav.onShare} testID="share-stuck">
          Share
        </Btn>
      </View>
    </View>
  );
}

export type DidntStickNav = { onTryNew: () => void; onKeepTrying: () => void; onSendToCoach: () => void; onBack: () => void };

export function DidntStickScreen({ cue, nav }: { cue: CueRecord; nav: DidntStickNav }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { sessions } = useLibrary();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="didnt-stick">
      <Frame image={cue.after.image} width={width} height={Math.round(Math.min(380, height * 0.42))} gray opacity={0.7} focus={{ x: 0.5, y: 0.35 }}>
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0 }}>
          <TopBar back="Cues" onBack={nav.onBack} more={false} />
        </View>
      </Frame>
      <View style={{ flex: 1, paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <StatusDot status="didnt_stick" />
          <SmallCaps color={colors.text}>{`Didn't stick · ${SINGULAR_MOVEMENT[cue.movement]}`}</SmallCaps>
        </View>
        <Text style={[display(36), { color: colors.text }]} testID="didnt-stick-headline">
          {didntStickHeadline(cue, sessions)}
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
          {cue.suggestion?.why ?? "That usually means the cue was aimed at the wrong thing. Film another set and I'll look for what's underneath it."}
        </Text>
      </View>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7), gap: space.s3 }}>
        {cue.suggestion ? (
          <Btn onPress={nav.onTryNew} testID="try-new-cue">
            Try the new cue
          </Btn>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Underlined onPress={nav.onKeepTrying} testID="keep-trying">
            Keep trying this one
          </Underlined>
          <Underlined onPress={nav.onSendToCoach} testID="send-to-coach">
            Send to my coach
          </Underlined>
        </View>
      </View>
    </View>
  );
}
