import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis } from '../../analysis/types';
import { liftTitle } from '../../analysis/format';
import { keyFrameAt, liftPath, repByIndex } from '../../analysis/timeline';
import { toScreen } from '../../analysis/geometry';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import Readout from '../../components/Readout';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import EvidenceStage from './EvidenceStage';
import WhyDrawer from './WhyDrawer';
import Stage from './Stage';
import { FlarePath, OverlaySvg } from './overlays';

type Nav = { onTry: () => void; onNotForMe: () => void; onBack: () => void; onFilmAgain: () => void };

export default function CueScreen({ analysis, initialWhy = false, nav }: { analysis: Analysis; initialWhy?: boolean; nav: Nav }) {
  const [why, setWhy] = useState(initialWhy);
  const cue = analysis.cue;
  if (!cue) return <NoCue analysis={analysis} onBack={nav.onBack} />;
  if (cue.confidence !== 'clear') return <LowConfidence analysis={analysis} nav={nav} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="cue-screen">
      <CueBody analysis={analysis} nav={nav} onWhy={() => setWhy(true)} />
      {why ? <WhyDrawer analysis={analysis} onClose={() => setWhy(false)} /> : null}
    </View>
  );
}

function CueBody({ analysis, nav, onWhy }: { analysis: Analysis; nav: Nav; onWhy: () => void }) {
  const { width } = useWindowDimensions();
  const cue = analysis.cue!;
  return (
    <>
      <EvidenceStage analysis={analysis} cue={cue} box={{ width, height: width }} />
      <View style={{ flex: 1, paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s3 }}>
        <SmallCaps>One thing to fix · AI estimate</SmallCaps>
        <Text style={[display(40), { color: colors.text }]} testID="cue-text">
          {cue.text}
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>{cue.why}</Text>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>
          {cue.confidenceText}
        </Text>
      </View>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s3 }}>
        <Btn onPress={nav.onTry} testID="cue-try">
          Try this next session
        </Btn>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Btn kind="text" onPress={nav.onNotForMe} testID="cue-not-for-me">
            Not for me
          </Btn>
          <Btn kind="text" onPress={onWhy} testID="cue-why">
            Why this and not something else?
          </Btn>
        </View>
      </View>
    </>
  );
}

function LowConfidence({ analysis, nav }: { analysis: Analysis; nav: Nav }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cue = analysis.cue!;
  const rep = repByIndex(analysis, cue.evidence.rep);
  const key = keyFrameAt(rep, cue.evidence.frame);
  const box = { width, height: Math.round(width * (400 / 390)) };
  const src = { width: analysis.video.width, height: analysis.video.height };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="low-confidence">
      <TopBar title={liftTitle(analysis)} onBack={nav.onBack} />
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
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 15, lineHeight: 21 }}>
          {cue.confidence === 'low' ? 'Low confidence' : 'Worth checking, not certain'}
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
          {cue.confidenceText}
        </Text>
      </View>
      <View>
        <Stage src={src} box={box} focus={{ x: 0.5, y: 0.45 }} layers={[{ image: key.image }]}>
          {(fit) => (
            <OverlaySvg box={box}>
              <FlarePath points={liftPath(rep).map((p) => toScreen(p, fit))} dashed testID="dashed-path" />
            </OverlaySvg>
          )}
        </Stage>
        <Readout style={{ position: 'absolute', left: 24, bottom: 16 }}>dashed path = lower confidence</Readout>
      </View>
      <View style={{ flex: 1, paddingTop: space.s4, paddingHorizontal: space.gutter, gap: space.s2 }}>
        <SmallCaps>Possible</SmallCaps>
        <Text style={[display(32), { color: colors.text }]}>{cue.text}</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>{cue.why}</Text>
      </View>
      <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7 }}>
        <Btn kind="secondary" onPress={nav.onFilmAgain} testID="film-again">
          Film another set
        </Btn>
      </View>
    </View>
  );
}

function NoCue({ analysis, onBack }: { analysis: Analysis; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <TopBar title={liftTitle(analysis)} onBack={onBack} />
      <View style={{ padding: space.gutter, gap: space.s2 }}>
        <Text style={[display(32), { color: colors.text }]}>
          {analysis.failure ? "We couldn't read this one" : 'Nothing to fix on this set'}
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          {analysis.failure?.message ?? 'Every rep matched your best. Keep filming.'}
        </Text>
      </View>
    </View>
  );
}
