import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Movement } from '../../analysis/types';
import { ANALYSES } from '../../analysis/fixtures';
import { liftPath, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Row from '../../components/Row';
import Segmented from '../../components/Segmented';
import SmallCaps from '../../components/SmallCaps';
import { colors, shape, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import {
  activeCue,
  filterLifts,
  freeVideosLabel,
  groupByDay,
  groupMovements,
  latestCue,
  liftDetail,
  newestDone,
  statusLabel,
  lower,
  liftTitle,
  sessionsCounter,
  type Group,
} from './derive';
import { shortMovement } from './metrics';
import { t } from '../../i18n';
import { cueText } from '../../i18n/cues';
import { useLibrary } from './repository';
import type { Lift, Session, CueRecord } from './types';
import { Chip, Frame, Pulse, StatusDot, Title, Underlined } from './ui';
import FadeRow from '../analysis/FadeRow';

export type LiftsNav = {
  onOpen: (lift: Lift) => void;
  onRetake: (lift: Lift) => void;
  onUnlock: () => void;
  onRecord: () => void;
  onImport: () => void;
  onDemo: () => void;
  onCue: (id: string) => void;
};

export default function LiftsScreen({ nav }: { nav: LiftsNav }) {
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const [group, setGroup] = useState<Group>('all');
  const [movement, setMovement] = useState<Movement | null>(null);
  const chip = freeVideosLabel(lib);
  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Title>{t('library.tabs.lifts')}</Title>
      {chip ? (
        <Pressable onPress={nav.onUnlock} testID="free-chip" hitSlop={8} style={{ height: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.text2, ...type.readout }}>{chip}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (lib.lifts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter }} testID="lifts-empty">
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s5 }}>
          <SideOnDiagram />
          <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>{t('library.lifts.emptyTitle')}</Text>
          <Text style={{ color: colors.text2, ...type.callout, textAlign: 'center' }}>
            {t('library.lifts.emptyBody')}
          </Text>
          <View style={{ alignSelf: 'stretch', gap: space.s3 }}>
            <Btn onPress={nav.onImport} testID="empty-import">
              {t('library.lifts.import')}
            </Btn>
            <Btn kind="secondary" onPress={nav.onRecord} testID="empty-record">
              {t('library.lifts.record')}
            </Btn>
            <Btn kind="text" onPress={nav.onDemo} testID="empty-demo" style={{ alignSelf: 'center' }}>
              {t('library.lifts.demo')}
            </Btn>
          </View>
        </View>
      </View>
    );
  }

  const cue = activeCue(lib.cues);
  const visible = filterLifts(lib.lifts, group, movement);
  const days = groupByDay(visible, lib.today);
  const newest = newestDone(lib.lifts);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter, paddingBottom: space.s6 }}
      testID="lifts"
    >
      <View style={{ gap: space.s4 }}>
        {header}
        {cue ? (
          <Pressable
            onPress={() => nav.onCue(cue.id)}
            testID="cue-strip"
            style={{
              paddingVertical: space.s3,
              paddingHorizontal: space.s4,
              borderWidth: 1,
              borderColor: colors.hairline,
              ...shape.control,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.s3,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StatusDot status="trying" />
                <SmallCaps size={12}>{t('library.status.trying')}</SmallCaps>
              </View>
              <Text numberOfLines={2} style={{ color: colors.text, ...type.button }}>
                {cueText(cue.metricId, cue.text)}
              </Text>
              <Text style={{ color: colors.text2, ...type.readout }}>
                {t('library.lifts.sessions', { counter: sessionsCounter(cue, lib.sessions) })}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <View style={{ gap: 6 }}>
          <View style={{ alignSelf: 'flex-start' }}>
            <Segmented
              testID="group"
              value={group}
              onChange={(g) => {
                setGroup(g);
                setMovement(null);
              }}
              options={[
                { value: 'all', label: t('library.lifts.all') },
                { value: 'barbell', label: t('library.lifts.barbell') },
                { value: 'gymnastics', label: t('library.lifts.gymnastics') },
              ]}
            />
          </View>
          <View style={{ marginHorizontal: -space.gutter }}>
          <FadeRow testID="movement-chips" contentContainerStyle={{ gap: 6, paddingHorizontal: space.gutter }}>
            {groupMovements(group).map((m) => (
              <Chip
                key={m}
                label={shortMovement(m)}
                selected={movement === m}
                onPress={() => setMovement(movement === m ? null : m)}
                testID={`movement-${m}`}
              />
            ))}
          </FadeRow>
          </View>
        </View>
      </View>
      <View style={{ paddingTop: space.s2 }}>
        {days.length === 0 ? (
          <Text style={{ color: colors.text2, ...type.callout, paddingTop: space.s5 }}>
            {t('library.lifts.nothing')}
          </Text>
        ) : null}
        {days.map((d) => (
          <View key={d.day}>
            <View style={{ paddingTop: 10, paddingBottom: 6 }}>
              <SmallCaps>{d.label}</SmallCaps>
            </View>
            {d.lifts.map((l) => (
              <LiftRow key={l.id} lift={l} sessions={lib.sessions} cues={lib.cues} newest={newest.has(l.id)} nav={nav} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function thumbPath(l: Lift) {
  const a = l.analysisId ? ANALYSES[l.analysisId] : undefined;
  if (!a) return undefined;
  return liftPath(repByIndex(a, a.bestRepIndex));
}

function LiftRow({ lift, sessions, cues, newest, nav }: { lift: Lift; sessions: Session[]; cues: CueRecord[]; newest: boolean; nav: LiftsNav }) {
  const muted = lift.status === 'queued';
  const cue = newest ? latestCue(cues, lift.movement) : undefined;
  const mono = lift.status === 'done' || lift.status === 'processing';
  const thumb =
    lift.status === 'processing' ? (
      <Pulse>
        <View style={{ width: 48, height: 56, backgroundColor: colors.surface }} />
      </Pulse>
    ) : lift.status === 'failed' ? (
      <View style={{ width: 48, height: 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text3, ...type.label, fontFamily: fontFamily.mono }}>?</Text>
      </View>
    ) : (
      <Frame image={lift.thumb} width={48} height={56} gray opacity={muted ? 0.4 : 1} path={thumbPath(lift)} />
    );
  return (
    <Row onPress={() => nav.onOpen(lift)} testID={`lift-${lift.id}`} divider="top" style={{ gap: space.s4, paddingVertical: 10 }}>
      {thumb}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: muted ? colors.text2 : colors.text, ...type.button }}>
          {liftTitle(lift)}
        </Text>
        <Text
          numberOfLines={1}
          style={
            mono
              ? { color: colors.text2, ...type.readout }
              : { color: colors.text2, ...type.label, fontFamily: fontFamily.body }
          }
        >
          {liftDetail(lift, sessions, { cueShown: !!cue })}
        </Text>
        {cue ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusDot status={cue.status} testID={`dot-${lift.id}-${cue.status}`} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text2, ...type.readout }}>
              {t('library.lifts.cueLine', { status: statusLabel(cue.status), cue: lower(cueText(cue.metricId, cue.text)) })}
            </Text>
          </View>
        ) : null}
      </View>
      {lift.status === 'failed' ? <Underlined onPress={() => nav.onRetake(lift)} testID={`retake-${lift.id}`}>{t('library.lifts.retake')}</Underlined> : null}
      {lift.status === 'queued' ? <Underlined onPress={nav.onUnlock} testID={`unlock-${lift.id}`}>{t('library.lifts.unlock')}</Underlined> : null}
    </Row>
  );
}

function SideOnDiagram() {
  return (
    <Svg width={240} height={160} viewBox="0 0 240 160">
      <Line x1={0} y1={140} x2={240} y2={140} stroke={colors.hairline} />
      <Rect x={24} y={118} width={10} height={22} fill={colors.text} />
      <Rect x={20} y={130} width={18} height={10} fill={colors.hairline} />
      <G fill={colors.text} opacity={0.5}>
        <Circle cx={186} cy={56} r={7} />
        <Path d="M180 64 L192 64 L197 98 L192 128 L184 128 L185 106 L178 106 L175 128 L167 128 L172 98Z" />
        <Path d="M186 64 L208 52 L211 58 L190 70Z" />
        <Rect x={211} y={48} width={6} height={14} />
        <Rect x={164} y={48} width={6} height={14} />
      </G>
      <Line x1={38} y1={130} x2={166} y2={130} stroke={colors.flare} strokeWidth={1.5} />
      <SvgText x={84} y={124} fontFamily={fontFamily.display} fontSize={16} fill={colors.flare}>
        3–4 m
      </SvgText>
    </Svg>
  );
}
