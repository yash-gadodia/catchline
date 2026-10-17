import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis, Cue } from '../../analysis/types';
import { filmedAtAngle, liftTitle } from '../../analysis/format';
import { keyFrameAt, keyFrameForPhase, liftPath, repByIndex } from '../../analysis/timeline';
import { toScreen } from '../../analysis/geometry';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import EvidenceStage from './EvidenceStage';
import WhyDrawer from './WhyDrawer';
import CueNotes, { Disclaimer } from './CueNotes';
import DrillCard from '../drills/DrillCard';
import { isSample } from '../../analysis/fixtures';
import { baselineSentence } from './baseline';
import { useLibrary } from '../library/repository';
import Stage from './Stage';
import { FlarePath, OverlaySvg } from './overlays';
import RetestVerdict, { useRetest, useRetestable, type Retest } from './RetestVerdict';
import type { CueRecord } from '../library/types';
import { formatDate, t } from '../../i18n';
import { cueText, cueWhy } from '../../i18n/cues';

type Nav = {
  onTry: () => void;
  onNotForMe: () => void;
  onBack: () => void;
  onFilmAgain: () => void;
  onKeep?: () => void;
  onMore?: () => void;
  onRetest?: (cueId: string) => void;
  onShare?: () => void;
  onStuck?: (cueId: string) => void;
};

type RetestProps = { retest: Retest | null; retestable?: CueRecord };

export default function CueScreen({
  analysis,
  initialWhy = false,
  retestCueId,
  nav,
}: {
  analysis: Analysis;
  initialWhy?: boolean;
  retestCueId?: string;
  nav: Nav;
}) {
  const [why, setWhy] = useState(initialWhy);
  const retest = useRetest(analysis, retestCueId);
  const retestable = useRetestable(analysis, retestCueId);
  const cue = analysis.cue;
  if (!cue && !analysis.failure && analysis.reps.length > 0) return <Clean analysis={analysis} nav={nav} retest={retest} />;
  if (!cue) return <NoCue analysis={analysis} nav={nav} retest={retest} retestable={retestable} />;
  if (cue.confidence !== 'clear') return <LowConfidence analysis={analysis} cue={cue} nav={nav} retest={retest} retestable={retestable} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="cue-screen">
      <CueBody analysis={analysis} cue={cue} nav={nav} onWhy={() => setWhy(true)} retest={retest} retestable={retestable} />
      {why ? <WhyDrawer analysis={analysis} onClose={() => setWhy(false)} /> : null}
    </View>
  );
}

function CueBody({
  analysis,
  cue,
  nav,
  onWhy,
  retest,
  retestable,
}: { analysis: Analysis; cue: Cue; nav: Nav; onWhy: () => void } & RetestProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { lifts, sessions } = useLibrary();
  const sample = isSample(analysis);
  const baseline = sample ? null : baselineSentence(analysis, lifts, sessions);
  return (
    <>
      <EvidenceStage analysis={analysis} cue={cue} box={{ width, height: width }} safeTop={insets.top} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s3 }}>
        {retest ? <RetestVerdict retest={retest} onStuck={nav.onStuck} /> : null}
        <SmallCaps>{sample ? t('analysis.cue.sampleLabel') : t('analysis.cue.oneThingLabel')}</SmallCaps>
        <Text style={[display(40), { color: colors.text }]} testID="cue-text">
          {cueText(cue.faultId, cue.text)}
        </Text>
        <Text style={{ color: colors.text2, ...type.body }}>{cueWhy(cue.faultId, cue.why)}</Text>
        {baseline ? (
          <Text testID="cue-baseline" style={{ color: colors.text2, ...type.body }}>
            {baseline}
          </Text>
        ) : null}
        <StatusRow>{cue.confidenceText}</StatusRow>
        <DrillCard faultId={cue.faultId} />
        <CueNotes notes={analysis.notes} />
        <Disclaimer />
        <Reanalysed analysis={analysis} />
      </ScrollView>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s2 }}>
        <Btn onPress={nav.onTry} testID="cue-try">
          {t('analysis.cue.try')}
        </Btn>
        <RetestButton cue={retestable} nav={nav} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <TextAction onPress={nav.onNotForMe} testID="cue-not-for-me">
            {t('analysis.cue.notForMe')}
          </TextAction>
          <TextAction onPress={onWhy} testID="cue-why">
            {t('analysis.cue.whyThis')}
          </TextAction>
        </View>
      </View>
    </>
  );
}

function RetestButton({ cue, nav }: { cue?: CueRecord; nav: Nav }) {
  if (!cue || !nav.onRetest) return null;
  return (
    <Btn kind="secondary" onPress={() => nav.onRetest?.(cue.id)} testID="cue-retest">
      {t('analysis.cue.retest')}
    </Btn>
  );
}

// A lift re-run from its stored trace says so, quietly: the numbers may differ from the first time it was shown.
export function Reanalysed({ analysis }: { analysis: Analysis }) {
  if (!analysis.reanalysedAt) return null;
  const date = formatDate(new Date(analysis.reanalysedAt), { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Text testID="reanalysed" style={{ color: colors.text2, ...type.caption }}>
      {t('analysis.cue.reanalysed', { date })}
    </Text>
  );
}

// Bone dot + mono line, the same shape as the low-confidence banner.
function StatusRow({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }} testID="confidence-row">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} />
      <Text style={{ color: colors.text, ...type.readout }}>{children}</Text>
    </View>
  );
}

// 44pt-high text button with no underline (underline is for inline links).
function TextAction({ children, onPress, testID }: { children: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" style={{ height: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, ...type.label }}>{children}</Text>
    </Pressable>
  );
}

function LowConfidence({ analysis, cue, nav, retest, retestable }: { analysis: Analysis; cue: Cue; nav: Nav } & RetestProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rep = repByIndex(analysis, cue.evidence.rep);
  const key = keyFrameAt(rep, cue.evidence.frame);
  const box = { width, height: Math.round(width * (330 / 390)) };
  const src = { width: analysis.video.width, height: analysis.video.height };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="low-confidence">
      <TopBar title={liftTitle(analysis)} onBack={nav.onBack} onMore={nav.onMore} />
      <View
        testID="confidence-banner"
        style={{
          marginHorizontal: space.gutter,
          marginBottom: space.s3,
          paddingVertical: space.s3,
          paddingHorizontal: space.s4,
          borderLeftWidth: 2,
          borderLeftColor: colors.text,
          backgroundColor: colors.surface,
          gap: 2,
        }}
      >
        <Text style={{ color: colors.text, ...type.callout, fontFamily: fontFamily.bodyBold }}>
          {cue.confidence === 'low' ? t('analysis.cue.lowConfidence') : t('analysis.cue.worthChecking')}
        </Text>
        <Text style={{ color: colors.text2, ...type.callout }}>
          {cue.confidenceText}
        </Text>
        <Text style={{ color: colors.text2, ...type.readout }}>{t('analysis.cue.dashedPath')}</Text>
      </View>
      <View>
        <Stage src={src} box={box} focus={{ x: 0.5, y: 0.45 }} layers={[{ image: key.image }]}>
          {(fit) => (
            <OverlaySvg box={box}>
              <FlarePath points={liftPath(rep).map((p) => toScreen(p, fit))} dashed testID="dashed-path" />
            </OverlaySvg>
          )}
        </Stage>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.s4, paddingHorizontal: space.gutter, gap: space.s2 }}>
        {retest ? <RetestVerdict retest={retest} onStuck={nav.onStuck} /> : null}
        <SmallCaps>{t('analysis.cue.possible')}</SmallCaps>
        <Text style={[display(32), { color: colors.text }]}>{cueText(cue.faultId, cue.text)}</Text>
        <Text style={{ color: colors.text2, ...type.callout }}>{cueWhy(cue.faultId, cue.why)}</Text>
        <CueNotes notes={analysis.notes} />
        <Disclaimer />
        <Reanalysed analysis={analysis} />
      </ScrollView>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s2 }}>
        <Btn
          onPress={() => {
            nav.onKeep?.();
            nav.onTry();
          }}
          testID="see-breakdown"
        >
          {t('analysis.cue.seeBreakdown')}
        </Btn>
        <RetestButton cue={retestable} nav={nav} />
        {filmedAtAngle(cue) ? (
          <View style={{ alignItems: 'center' }}>
            <TextAction onPress={nav.onFilmAgain} testID="film-again">
              {t('analysis.cue.filmAgain')}
            </TextAction>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// A clean rep: measured fine and no fault crossed its threshold. A result, not a gap: the path, then go heavier.
function Clean({ analysis, nav, retest }: { analysis: Analysis; nav: Nav; retest: Retest | null }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rep = repByIndex(analysis, analysis.bestRepIndex);
  const key = keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1];
  const box = { width, height: Math.round(width * (330 / 390)) };
  const src = { width: analysis.video.width, height: analysis.video.height };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="clean-result">
      <TopBar title={liftTitle(analysis)} onBack={nav.onBack} onMore={nav.onMore} />
      <View>
        <Stage src={src} box={box} focus={{ x: 0.5, y: 0.45 }} layers={[{ image: key?.image }]}>
          {(fit) => (
            <OverlaySvg box={box}>
              <FlarePath points={liftPath(rep).map((p) => toScreen(p, fit))} testID="clean-path" />
            </OverlaySvg>
          )}
        </Stage>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.s4, paddingHorizontal: space.gutter, gap: space.s2 }}>
        {retest ? <RetestVerdict retest={retest} onStuck={nav.onStuck} /> : null}
        <SmallCaps>{t('analysis.clean.label')}</SmallCaps>
        <Text style={[display(40), { color: colors.text }]} testID="clean-title">
          {t('analysis.clean.title')}
        </Text>
        <Text style={{ color: colors.text2, ...type.body }} testID="clean-body">
          {t('analysis.clean.body')}
        </Text>
        <Disclaimer />
        <Reanalysed analysis={analysis} />
      </ScrollView>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s2 }}>
        <Btn onPress={nav.onFilmAgain} testID="retest-heavier">
          {t('analysis.clean.retestHeavier')}
        </Btn>
        <Btn kind="secondary" onPress={nav.onTry} testID="see-breakdown">
          {t('analysis.cue.seeBreakdown')}
        </Btn>
        {nav.onShare ? (
          <View style={{ alignItems: 'center' }}>
            <TextAction onPress={nav.onShare} testID="clean-share">
              {t('analysis.clean.share')}
            </TextAction>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function NoCue({ analysis, nav, retest, retestable }: { analysis: Analysis; nav: Nav } & RetestProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <TopBar title={liftTitle(analysis)} onBack={nav.onBack} />
      <View style={{ flex: 1, padding: space.gutter, gap: space.s2 }}>
        {retest ? <RetestVerdict retest={retest} onStuck={nav.onStuck} /> : null}
        <Text style={[display(32), { color: colors.text }]}>
          {analysis.failure ? t('analysis.cue.couldNotRead') : t('analysis.cue.nothingToFix')}
        </Text>
        <Text style={{ color: colors.text2, ...type.body }}>
          {analysis.failure?.message ?? t('analysis.cue.everyRepMatched')}
        </Text>
        <Reanalysed analysis={analysis} />
      </View>
      {retestable && nav.onRetest ? (
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7) }}>
          <Btn onPress={() => nav.onRetest?.(retestable.id)} testID="cue-retest">
            {t('analysis.cue.retest')}
          </Btn>
        </View>
      ) : null}
    </View>
  );
}
