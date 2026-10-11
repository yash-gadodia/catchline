import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis, PhaseName } from '../../analysis/types';
import { compareRows, fmt, shortPhase, signedCm, syncCaption, type CompareRow } from '../../analysis/format';
import { focusOn, toScreen, type Size } from '../../analysis/geometry';
import { keyFrameAt, keyFrameForPhase, liftPath, pathUpTo, phaseAt, phaseRail, pointAt, repByIndex } from '../../analysis/timeline';
import type { CompareTarget } from '../../analysis/fixtures';
import Readout from '../../components/Readout';
import Segmented from '../../components/Segmented';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, radius, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import Stage from './Stage';
import { FlarePath, GhostPath, HeroNumber, OverlaySvg } from './overlays';

export type CompareMode = 'ghost' | 'side';

type Sync = {
  phase: PhaseName;
  today: { rep: ReturnType<typeof repByIndex>; frame: number; image?: string };
  other: { rep: ReturnType<typeof repByIndex>; frame: number; image?: string };
};

export function syncByPhase(today: Analysis, other: Analysis): Sync {
  const tRep = repByIndex(today, today.cue?.evidence.rep ?? today.bestRepIndex);
  const oRep = repByIndex(other, other.bestRepIndex);
  const tFrame = today.cue?.evidence.frame ?? tRep.keyFrames[0].frame;
  const phase = phaseAt(tRep, tFrame)?.name ?? tRep.phases[0].name;
  const tKey = keyFrameAt(tRep, tFrame);
  const oKey = keyFrameForPhase(oRep, phase) ?? oRep.keyFrames[0];
  return {
    phase,
    today: { rep: tRep, frame: tFrame, image: tKey.image },
    other: { rep: oRep, frame: oKey.frame, image: oKey.image },
  };
}

export default function CompareScreen({
  analysis,
  target,
  mode,
  onMode,
  onTarget,
  onBack,
}: {
  analysis: Analysis;
  target: CompareTarget;
  mode: CompareMode;
  onMode: (m: CompareMode) => void;
  onTarget: () => void;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const other = target.analysis;
  const sync = syncByPhase(analysis, other);
  const rows = compareRows(analysis.measurements, other.measurements, target.kind === 'best' ? 'best' : 'last');
  const height = Math.round(width * (440 / 390));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID={`compare-${mode}`}>
      <TopBar
        back="Back"
        onBack={onBack}
        center={
          <Segmented
            testID="compare-mode"
            value={mode}
            onChange={onMode}
            options={[
              { value: 'ghost', label: 'Ghost' },
              { value: 'side', label: 'Side by side' },
            ]}
          />
        }
      />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.s3, flexDirection: 'row' }}>
        <Pressable
          onPress={onTarget}
          testID="compare-target"
          style={{
            height: 36,
            paddingHorizontal: space.s3,
            backgroundColor: colors.surface,
            borderRadius: radius.control,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>
            {`vs ${target.label} · ${fmt(other.loadKg ?? 0)} kg · ${target.dateLabel}`}
          </Text>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>▾</Text>
        </Pressable>
      </View>
      {mode === 'ghost' ? (
        <Ghost analysis={analysis} other={other} sync={sync} box={{ width, height }} label={target.kind === 'best' ? 'best' : target.dateLabel} />
      ) : (
        <SideBySide analysis={analysis} other={other} sync={sync} width={width} height={height} dateLabel={target.dateLabel} />
      )}
      <Rows rows={rows} topRule={mode === 'ghost'} />
      {mode === 'ghost' ? (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: space.s7 }}>
          <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }} testID="sync-caption">
            {syncCaption(sync.phase, sync.today.frame, sync.other.frame)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Ghost({ analysis, other, sync, box, label }: { analysis: Analysis; other: Analysis; sync: Sync; box: Size; label: string }) {
  const src = { width: analysis.video.width, height: analysis.video.height };
  return (
    <View>
      <Stage
        testID="ghost-stage"
        src={src}
        box={box}
        focus={{ x: 0.5, y: 0.35 }}
        layers={[
          { image: sync.today.image, key: 'today' },
          { image: sync.other.image, gray: true, opacity: 0.25, blend: true, key: 'ghost' },
        ]}
      >
        {(fit) => {
          const t = pointAt(sync.today.rep.path, sync.today.frame)!;
          const o = pointAt(sync.other.rep.path, sync.other.frame)!;
          const ts = toScreen(t, fit);
          const os = toScreen({ x: o.x, y: t.y }, fit);
          const deltaCm = ((t.x - o.x) * analysis.video.width) / (analysis.pxPerCm ?? 1);
          return (
            <>
              <OverlaySvg box={box}>
                <GhostPath points={liftPath(sync.other.rep).map((p) => toScreen(p, fit))} testID="ghost-path" />
                <FlarePath points={liftPath(sync.today.rep).map((p) => toScreen(p, fit))} />
                <FlarePath points={[os, ts]} halo={false} />
              </OverlaySvg>
              <HeroNumber text={signedCm(deltaCm)} at={{ x: Math.max(ts.x, os.x) + 8, y: ts.y + 18 }} size={36} box={box} />
            </>
          );
        }}
      </Stage>
      <View
        style={{
          position: 'absolute',
          left: space.gutter,
          bottom: 16,
          flexDirection: 'row',
          gap: 16,
          backgroundColor: colors.scrim,
          paddingVertical: 4,
          paddingHorizontal: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 3, backgroundColor: colors.flare }} />
          <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>today</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <View style={{ width: 6, height: 2, backgroundColor: colors.text }} />
            <View style={{ width: 6, height: 2, backgroundColor: colors.text }} />
          </View>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

function SideBySide({
  analysis,
  other,
  sync,
  width,
  height,
  dateLabel,
}: {
  analysis: Analysis;
  other: Analysis;
  sync: Sync;
  width: number;
  height: number;
  dateLabel: string;
}) {
  const box = { width: (width - 2) / 2, height };
  const src = { width: analysis.video.width, height: analysis.video.height };
  const oSrc = { width: other.video.width, height: other.video.height };
  const tPoint = pointAt(sync.today.rep.path, sync.today.frame)!;
  const oPoint = pointAt(sync.other.rep.path, sync.other.frame)!;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View>
          <Stage testID="side-today" src={src} box={box} focus={focusOn(tPoint, src, box)} zoom={1.3} zoomOrigin={tPoint} layers={[{ image: sync.today.image }]}>
            {(fit) => (
              <OverlaySvg box={box}>
                <FlarePath points={pathUpTo(sync.today.rep.path, sync.today.frame).map((p) => toScreen(p, fit))} halo={false} />
              </OverlaySvg>
            )}
          </Stage>
          <Readout size={12} style={{ position: 'absolute', left: 12, top: 12 }}>
            today
          </Readout>
        </View>
        <View>
          <Stage testID="side-other" src={oSrc} box={box} focus={focusOn(oPoint, oSrc, box)} zoom={1.3} zoomOrigin={oPoint} layers={[{ image: sync.other.image, gray: true }]}>
            {(fit) => (
              <OverlaySvg box={box}>
                <GhostPath points={pathUpTo(sync.other.rep.path, sync.other.frame).map((p) => toScreen(p, fit))} />
              </OverlaySvg>
            )}
          </Stage>
          <Readout size={12} color={colors.text2} style={{ position: 'absolute', left: 12, top: 12 }}>
            {dateLabel}
          </Readout>
        </View>
      </View>
      <View
        testID="phase-rail"
        style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline }}
      >
        {phaseRail(sync.today.rep).map((p, i, all) => {
          const on = p.name === sync.phase;
          return (
            <View
              key={p.name}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 6,
                borderRightWidth: i === all.length - 1 ? 0 : 1,
                borderRightColor: colors.hairline,
                borderBottomWidth: 2,
                borderBottomColor: on ? colors.text : 'transparent',
              }}
            >
              <SmallCaps size={11} tracking={0.02} color={on ? colors.text : colors.text2}>
                {shortPhase(p.name)}
              </SmallCaps>
            </View>
          );
        })}
      </View>
    </>
  );
}

function Rows({ rows, topRule }: { rows: CompareRow[]; topRule: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        paddingTop: space.s4,
        paddingHorizontal: space.gutter,
        marginTop: topRule ? space.s3 : 0,
        borderTopWidth: topRule ? 1 : 0,
        borderTopColor: colors.hairline,
      }}
    >
      {rows.map((r, i) => (
        <View
          key={r.id}
          testID={`compare-row-${r.id}`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingVertical: 12,
            borderBottomWidth: i === rows.length - 1 ? 0 : 1,
            borderBottomColor: colors.hairline,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>{r.label}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 15, lineHeight: 20 }}>{r.value}</Text>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>{r.delta}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
