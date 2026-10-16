import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Analysis, KeyFrame } from '../../analysis/types';
import { toScreen, type Fit } from '../../analysis/geometry';
import { keyFrameForPhase, liftPath, pointAt, repByIndex } from '../../analysis/timeline';
import { colors, shade, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import Mark from '../../components/Mark';
import Stage, { type StageLayer } from '../analysis/Stage';
import { FlarePath, KeyDots, OverlaySvg } from '../analysis/overlays';
import { cardCopy, cardSize, safeInsets } from './model';
import type { ShareAspect } from './overlay';

type Props = { analysis: Analysis; aspect: ShareAspect; brand: boolean };

const STROBE: { phase: string; opacity: number; gray: boolean }[] = [
  { phase: 'setup', opacity: 1, gray: true },
  { phase: 'first_pull', opacity: 0.5, gray: true },
  { phase: 'transition', opacity: 0.55, gray: true },
  { phase: 'second_pull', opacity: 0.5, gray: true },
  { phase: 'catch', opacity: 0.85, gray: false },
];

const FOCUS = { x: 0.5, y: 0.45 };

function shareRep(analysis: Analysis) {
  return repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
}

function strobeLayers(analysis: Analysis): StageLayer[] {
  const rep = shareRep(analysis);
  return STROBE.map((s) => ({ ...s, key: keyFrameForPhase(rep, s.phase) }))
    .filter((s): s is typeof s & { key: KeyFrame } => !!s.key)
    .map((s, i) => ({ image: s.key.image, gray: s.gray, opacity: s.opacity, blend: i > 0, key: s.phase }));
}

function keyDots(analysis: Analysis, fit: Fit) {
  const rep = shareRep(analysis);
  return ['setup', 'first_pull', 'transition', 'catch']
    .map((ph) => keyFrameForPhase(rep, ph))
    .map((k) => (k ? pointAt(rep.path, k.frame) : null))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => toScreen(p, fit));
}

// The still: the rep as a strobe of its key frames with the path on top, and
// the same text as the video (label, one number, the cue).
const ShareCard = forwardRef<View, Props>(function ShareCard({ analysis, aspect, brand }, ref) {
  const box = cardSize(aspect);
  const inset = safeInsets(aspect, box);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const copy = cardCopy(analysis);
  return (
    <View ref={ref} collapsable={false} testID={`share-card-${aspect}`} style={{ width: box.width, height: box.height, overflow: 'hidden', backgroundColor: colors.halo }}>
      <Stage src={src} box={box} focus={FOCUS} layers={strobeLayers(analysis)} style={{ position: 'absolute', left: 0, top: 0, backgroundColor: colors.halo }}>
        {(fit) => (
          <OverlaySvg box={box}>
            <FlarePath points={liftPath(shareRep(analysis)).map((p) => toScreen(p, fit))} testID="card-path" />
            <KeyDots points={keyDots(analysis, fit)} />
          </OverlaySvg>
        )}
      </Stage>
      <LinearGradient
        pointerEvents="none"
        colors={[shade(0), shade(0.78)]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />
      {brand ? (
        <View testID="card-brand" style={{ position: 'absolute', left: inset.left, top: inset.top, flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
          <Mark size={16} />
          {/* i18n-ok: brand name */}
          <Text style={[display(15), { color: colors.text }]}>Catchline</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: inset.left, right: inset.right, bottom: inset.bottom, gap: space.s1 }}>
        {copy.label ? (
          // design-ok: 11pt tracked kicker sized to the share card, below the type scale
          <Text testID="card-label" style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 15, letterSpacing: 11 * 0.08 }}>
            {copy.label.toUpperCase()}
          </Text>
        ) : null}
        {copy.hero ? (
          <Text testID="card-hero" numberOfLines={1} style={[display(58, true), { color: colors.text }]}>
            {copy.hero}
          </Text>
        ) : null}
        {copy.cue ? (
          <Text testID="card-cue" style={[display(25), { color: colors.text }]}>
            {copy.cue}
          </Text>
        ) : null}
        {/* design-ok: 11pt tracked meta line sized to the share card, below the type scale */}
        <Text testID="card-meta" style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 15, letterSpacing: 11 * 0.08 }}>
          {copy.meta}
        </Text>
      </View>
    </View>
  );
});

export default ShareCard;
