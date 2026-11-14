import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import TopBar from '../../components/TopBar';
import { impact } from '../../lib/haptics';
import { colors, control, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import TrackOverlay from './TrackOverlay';
import { barSpeed, speedStats } from './speed';
import { frameAt, liftRange, timeOf } from './tracker';

export type ComparedLift = { analysis: Analysis; body: Body | null; clipUri: string; title: string };

type Speed = 0.25 | 0.5 | 1;
const SPEEDS: Speed[] = [0.25, 0.5, 1];
const STEP_S = 1 / 30;
const CHART_H = 72;

// One side: its lift's frames, the clip's real rate, and the frame at a time since the lift began.
function sideOf(lift: ComparedLift, duration: number) {
  const { analysis, body } = lift;
  const count = Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
  const fps = duration > 0 ? count / duration : analysis.video.fps || 30;
  const { first, last } = liftRange(analysis.lift, count, false);
  return { count, fps, first, last, length: (last - first) / fps, frameAtT: (s: number) => Math.min(last, first + Math.max(0, Math.round(s * fps))) };
}

// Two lifts of the same kind next to each other (owner, 14-11: parity with WL Analysis), in step from the moment
// each lift begins: today's on the left, the earlier one on the right, each with its own bar path and body, and
// both bar speeds on one chart. One set of controls drives both.
export default function CompareScreen({ today, earlier, onBack }: { today: ComparedLift; earlier: ComparedLift; onBack: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lifts = [today, earlier] as const;
  const [durations, setDurations] = useState<[number, number]>([0, 0]);
  const sides = [sideOf(today, durations[0]), sideOf(earlier, durations[1])] as const;
  const total = Math.max(sides[0].length, sides[1].length, STEP_S);
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.25);

  const setup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.playbackRate = 0.25;
  };
  const players = [useVideoPlayer(today.clipUri, setup), useVideoPlayer(earlier.clipUri, setup)] as const;

  const live = useRef({ sides, total });
  live.current = { sides, total };
  const moveTo = (s: number) => {
    const next = Math.min(Math.max(0, s), live.current.total);
    atRef.current = next;
    setAt(next);
    players.forEach((p, i) => {
      const side = live.current.sides[i];
      p.currentTime = timeOf(side.frameAtT(next), side.fps);
    });
  };
  const seek = (s: number) => {
    players.forEach((p) => p.pause());
    moveTo(s);
  };

  useEffect(() => {
    const subs = players.flatMap((p, i) => [
      p.addListener('sourceLoad', (e) => {
        if (e.duration > 0) setDurations((d) => (i === 0 ? [e.duration, d[1]] : [d[0], e.duration]));
      }),
      p.addListener('timeUpdate', ({ currentTime }) => {
        const side = live.current.sides[i];
        // each clip stops on its own lift's last frame
        if (p.playing && frameAt(currentTime, side.fps, side.count) >= side.last) p.pause();
        // the clock follows the longer lift, which is still playing when the other has stopped
        if (!p.playing || side.length < live.current.total) return;
        const s = Math.min(live.current.total, Math.max(0, currentTime - side.first / side.fps));
        atRef.current = s;
        setAt(s);
      }),
      p.addListener('playingChange', () => setPlaying(players.some((q) => q.playing))),
    ]);
    return () => subs.forEach((s) => s.remove());
  }, [players[0], players[1]]);

  // both clips open on their lift's first frame once their lengths are known
  useEffect(() => {
    if (durations[0] > 0 && durations[1] > 0) moveTo(atRef.current);
  }, [durations[0], durations[1]]);

  const togglePlay = () => {
    impact('light');
    if (playing) return players.forEach((p) => p.pause());
    if (atRef.current >= total - STEP_S) moveTo(0);
    players.forEach((p, i) => {
      if (sides[i].frameAtT(atRef.current) < sides[i].last) p.play();
    });
  };

  const paneW = width / 2;
  const maxH = Math.round(height * 0.42);
  const boxes = lifts.map((l) => {
    const v = l.analysis.video;
    const w = Math.min(paneW, (maxH * v.width) / v.height);
    return { width: Math.round(w), height: Math.round((w * v.height) / v.width) };
  });
  const paneH = Math.max(boxes[0].height, boxes[1].height);
  const frames = sides.map((s) => s.frameAtT(at));
  const speeds = useMemo(() => lifts.map((l, i) => barSpeed(l.analysis.reps[0]?.path ?? [], sides[i].fps, l.analysis.lift)), [today, earlier, sides[0].fps, sides[1].fps]);

  const scrub = useRef({ seek, total, width });
  scrub.current = { seek, total, width };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrub.current.seek((e.nativeEvent.pageX / scrub.current.width) * scrub.current.total),
      onPanResponderMove: (e) => scrub.current.seek((e.nativeEvent.pageX / scrub.current.width) * scrub.current.total),
    }),
  ).current;

  // the two speed lines against time since each lift began
  const chartW = width - 2 * space.gutter;
  const lines = speeds.map((sp, i) => {
    if (!sp) return null;
    const side = sides[i];
    const pts = [...sp.at].filter(([f]) => f >= side.first && f <= side.last).sort((a, b) => a[0] - b[0]).map(([f, v]) => ({ f, s: (f - side.first) / side.fps, v }));
    return pts.length > 1 ? pts : null;
  });
  const all = lines.flatMap((l) => (l ? l.map((p) => p.v) : []));
  const hi = Math.max(...all, 0.1);
  const lo = Math.min(...all, -0.1);
  const x = (s: number) => (s / total) * chartW;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo)) * (CHART_H - 8);
  const fmt = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(2));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="compare-screen">
      <TopBar back={t('analysis.compare.back')} onBack={onBack} more={false} center={<Text style={{ ...type.button, color: colors.text }}>{t('analysis.compare.title')}</Text>} />
      <Pressable onPress={togglePlay} accessibilityRole="button" accessibilityLabel={playing ? t('analysis.player.pause') : t('analysis.player.play')} testID="compare-video" style={{ flexDirection: 'row', backgroundColor: colors.surface }}>
        {lifts.map((l, i) => (
          <View key={i} style={{ width: paneW, height: paneH, alignItems: 'center', justifyContent: 'center', borderLeftWidth: i === 1 ? stroke.hairline : 0, borderLeftColor: colors.hairline }}>
            <View style={{ width: boxes[i].width, height: boxes[i].height, overflow: 'hidden' }}>
              <VideoView player={players[i]} style={{ width: boxes[i].width, height: boxes[i].height }} contentFit="fill" nativeControls={false} allowsVideoFrameAnalysis={false} />
              <TrackOverlay analysis={l.analysis} body={l.body} frame={frames[i]} box={boxes[i]} show={{ path: true, lines: false, body: true }} speed={speeds[i]?.at} />
            </View>
          </View>
        ))}
      </Pressable>
      <View style={{ flexDirection: 'row' }}>
        {lifts.map((l, i) => (
          <Text key={i} testID={`compare-title-${i}`} numberOfLines={1} style={{ width: paneW, paddingHorizontal: space.s3, paddingTop: space.s2, ...type.caption, color: i === 0 ? colors.text : colors.text2 }}>
            {i === 0 ? t('analysis.compare.thisLift', { when: l.title }) : l.title}
          </Text>
        ))}
      </View>
      <View {...pan.panHandlers} testID="compare-scrub" accessibilityRole="adjustable" accessibilityLabel={t('analysis.tracker.scrub')} style={{ height: 44, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.hairline }}>
          <View style={{ height: 3, width: `${(at / total) * 100}%`, backgroundColor: colors.text }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s2, paddingHorizontal: space.gutter, paddingBottom: space.s2, borderBottomWidth: stroke.hairline, borderBottomColor: colors.hairline }}>
        <Chip testID="compare-back" label={t('analysis.tracker.prevFrame')} onPress={() => seek(atRef.current - STEP_S)}>‹</Chip>
        <Chip testID="compare-play" label={playing ? t('analysis.player.pause') : t('analysis.player.play')} onPress={togglePlay}>
          {playing ? t('analysis.player.pause') : t('analysis.player.play')}
        </Chip>
        <Chip testID="compare-forward" label={t('analysis.tracker.nextFrame')} onPress={() => seek(atRef.current + STEP_S)}>›</Chip>
        <Chip
          testID="compare-speed"
          label={t('analysis.player.speed', { speed: `${speed}×` })}
          onPress={() => {
            const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            players.forEach((p) => (p.playbackRate = next));
            setSpeed(next);
          }}
        >
          {`${speed}×`}
        </Chip>
      </View>
      <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: Math.max(insets.bottom, space.s4), gap: space.s2 }}>
        {all.length ? (
          <Svg width={chartW} height={CHART_H} testID="compare-chart">
            <Line x1={0} x2={chartW} y1={y(0)} y2={y(0)} stroke={colors.hairline} strokeWidth={stroke.hairline} />
            <Line x1={x(at)} x2={x(at)} y1={0} y2={CHART_H} stroke={colors.hairline} strokeWidth={stroke.hairline} />
            {[1, 0].map((i) => {
              const l = lines[i];
              if (!l) return null;
              const d = l.map((p, k) => `${k > 0 && p.f - l[k - 1].f <= 2 ? 'L' : 'M'}${x(p.s).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
              const now = speeds[i]?.at.get(frames[i]);
              return (
                <G key={i}>
                  <Path d={d} stroke={i === 0 ? colors.text : colors.text3} strokeWidth={1.5} strokeDasharray={i === 0 ? undefined : '3 3'} strokeLinejoin="round" strokeLinecap="round" fill="none" />
                  {now !== undefined ? <Circle cx={x(Math.min(at, sides[i].length))} cy={y(now)} r={i === 0 ? 4 : 3} fill={i === 0 ? colors.flare : colors.text2} /> : null}
                </G>
              );
            })}
          </Svg>
        ) : null}
        {lifts.map((l, i) => {
          const sp = speeds[i];
          const stats = sp ? speedStats(sp.at, sides[i].first, sides[i].last + 1) : null;
          return (
            <Text key={i} testID={`compare-stats-${i}`} numberOfLines={1} adjustsFontSizeToFit style={{ ...type.caption, color: i === 0 ? colors.text : colors.text2 }}>
              {stats ? t('analysis.compare.stats', { who: i === 0 ? t('analysis.compare.today') : t('analysis.compare.earlier'), now: fmt(sp?.at.get(frames[i])), peak: fmt(stats.max), avg: fmt(stats.avgUp) }) : t('analysis.compare.noSpeed', { who: i === 0 ? t('analysis.compare.today') : t('analysis.compare.earlier') })}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function Chip({ testID, label, onPress, children }: { testID: string; label: string; onPress: () => void; children: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={{ height: control.chipHeight, minWidth: control.chipHeight, paddingHorizontal: space.s3, borderWidth: stroke.hairline, borderColor: colors.hairline, ...shape.control, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ ...type.caption, color: colors.text }}>{children}</Text>
    </Pressable>
  );
}
