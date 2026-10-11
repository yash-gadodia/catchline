import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Image as SvgImage, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import type { Analysis, KeyFrame } from '../../analysis/types';
import { coverFit, toScreen, type Fit, type Size } from '../../analysis/geometry';
import { frameSource } from '../../analysis/frames';
import { phaseLabel, seconds } from '../../analysis/format';
import { keyFrameForPhase, liftPath, phaseSeconds, repByIndex } from '../../analysis/timeline';
import { colors } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import Stage, { type StageLayer } from '../analysis/Stage';
import Mark from '../../components/Mark';
import { CurrentDot, FlarePath, KeyDots, OverlaySvg } from '../analysis/overlays';
import {
  cardCopy,
  cardSize,
  safeInsets,
  stuckLine,
  type Aspect,
  type ShareOptions,
  type ShareType,
  type Stuck,
} from './model';

type Props = {
  analysis: Analysis;
  type: ShareType;
  aspect: Aspect;
  options: ShareOptions;
  watermark: string | null;
  coachHandle: string | null;
  stuck?: Stuck;
};

const STROBE: { phase: string; opacity: number; gray: boolean }[] = [
  { phase: 'setup', opacity: 1, gray: true },
  { phase: 'first_pull', opacity: 0.5, gray: true },
  { phase: 'transition', opacity: 0.55, gray: true },
  { phase: 'second_pull', opacity: 0.5, gray: true },
  { phase: 'catch', opacity: 0.85, gray: false },
];

const FOCUS = { x: 0.5, y: 0.45 };

function strobeLayers(analysis: Analysis, strobe: boolean): StageLayer[] {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const layers = STROBE.map((s) => ({ ...s, key: keyFrameForPhase(rep, s.phase) })).filter(
    (s): s is typeof s & { key: KeyFrame } => !!s.key
  );
  if (!strobe) {
    const last = layers[layers.length - 1];
    return last ? [{ image: last.key.image, key: last.phase }] : [];
  }
  return layers.map((s, i) => ({
    image: s.key.image,
    gray: s.gray,
    opacity: s.opacity,
    blend: i > 0,
    key: s.phase,
  }));
}

function pathPoints(analysis: Analysis, fit: Fit) {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  return liftPath(rep).map((p) => toScreen(p, fit));
}

function keyDots(analysis: Analysis, fit: Fit) {
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const path = liftPath(rep);
  return ['setup', 'first_pull', 'transition', 'catch']
    .map((ph) => keyFrameForPhase(rep, ph))
    .map((k) => (k ? path.find((p) => p.frame >= k.frame) ?? path[path.length - 1] : null))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => toScreen(p, fit));
}

function Watermark({ text, top, left }: { text: string; top: number; left: number }) {
  return (
    <View testID="watermark" style={{ position: 'absolute', top, left, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2, paddingHorizontal: 6 }}>
      <Text style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

function Meta({ children, size = 13 }: { children: string; size?: number }) {
  return (
    <Text
      testID="card-meta"
      numberOfLines={2}
      style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: size, lineHeight: Math.round(size * 1.4), letterSpacing: size * 0.08 }}
    >
      {children}
    </Text>
  );
}

function Hero({ text, size }: { text: string; size: number }) {
  return (
    <Text testID="card-hero" numberOfLines={1} adjustsFontSizeToFit style={[display(size, true), { color: colors.text, lineHeight: Math.round(size * 0.86) }]}>
      {text}
    </Text>
  );
}

function CueLine({ text, size }: { text: string; size: number }) {
  return (
    <Text testID="card-cue" style={[display(size), { color: colors.text, lineHeight: size }]}>
      {text}
    </Text>
  );
}

function Fade({ from, to, horizontal }: { from: number; to: number; horizontal?: boolean }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(0,0,0,0)', horizontal ? 'rgba(0,0,0,0.85)' : '#000']}
      start={horizontal ? { x: 0.5, y: 0.5 } : { x: 0.5, y: from }}
      end={horizontal ? { x: 1, y: 0.5 } : { x: 0.5, y: to }}
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
    />
  );
}

function StrobeCard({ analysis, aspect, options, watermark, coachHandle }: Props) {
  const box = cardSize('strobe_card', aspect);
  const inset = safeInsets(aspect, box);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const copy = cardCopy(analysis, options, coachHandle, aspect === '9:16');
  const layers = strobeLayers(analysis, options.strobe);
  const stage = (
    <Stage src={src} box={box} focus={FOCUS} layers={layers} style={{ position: 'absolute', left: 0, top: 0, backgroundColor: '#000' }}>
      {(fit) =>
        options.path ? (
          <OverlaySvg box={box}>
            <FlarePath points={pathPoints(analysis, fit)} testID="card-path" />
            {aspect === '9:16' ? <KeyDots points={keyDots(analysis, fit)} /> : null}
          </OverlaySvg>
        ) : null
      }
    </Stage>
  );

  if (aspect === '4:5') {
    return (
      <>
        {stage}
        <Fade from={0.5} to={1} horizontal />
        <View style={{ position: 'absolute', right: inset.right, top: inset.top, bottom: inset.bottom, width: 160, justifyContent: 'flex-end', alignItems: 'flex-end', gap: 8 }}>
          {copy.hero ? <Hero text={copy.hero} size={72} /> : null}
          {copy.cue ? <Text testID="card-cue" style={[display(22), { color: colors.text, lineHeight: 22, textAlign: 'right' }]}>{copy.cue}</Text> : null}
          <Meta size={11}>{copy.meta}</Meta>
        </View>
        {watermark ? <Watermark text={watermark} top={inset.top} left={inset.left} /> : null}
      </>
    );
  }

  if (aspect === '1:1') {
    return (
      <>
        {stage}
        <Fade from={0.6} to={1} />
        <View style={{ position: 'absolute', left: inset.left, right: inset.right, bottom: inset.bottom, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            {copy.hero ? <Hero text={copy.hero} size={64} /> : null}
            {copy.cue ? <CueLine text={copy.cue} size={20} /> : null}
          </View>
          <Meta size={11}>{copy.meta}</Meta>
        </View>
        {watermark ? <Watermark text={watermark} top={inset.top} left={inset.left} /> : null}
      </>
    );
  }

  return (
    <>
      {stage}
      <Fade from={0.45} to={0.75} />
      <View
        style={{
          position: 'absolute',
          left: inset.left,
          right: inset.right,
          bottom: inset.bottom,
          gap: 10,
          borderTopWidth: 1,
          borderTopColor: colors.hairline,
          paddingTop: 16,
        }}
      >
        {copy.hero ? <Hero text={copy.hero} size={112} /> : null}
        {copy.cue ? <CueLine text={copy.cue} size={28} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Meta>{copy.meta}</Meta>
          </View>
          <Mark size={22} />
        </View>
      </View>
      {watermark ? <Watermark text={watermark} top={inset.top} left={inset.left} /> : null}
    </>
  );
}

function OverlayVideoFrame({ analysis, aspect, options, watermark, coachHandle }: Props) {
  const box = cardSize('overlay_video', aspect);
  const inset = safeInsets(aspect, box);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const at = keyFrameForPhase(rep, 'second_pull') ?? rep.keyFrames[0];
  const copy = cardCopy(analysis, options, coachHandle, false);
  const strip = rep.phases.filter((p) => p.name !== 'recovery');
  return (
    <>
      <Stage src={src} box={box} focus={FOCUS} layers={[{ image: at?.image }]} style={{ position: 'absolute', left: 0, top: 0, backgroundColor: '#000' }}>
        {(fit) => {
          if (!options.path) return null;
          const pts = pathPoints(analysis, fit);
          const split = liftPath(rep).findIndex((p) => p.frame >= (at?.frame ?? 0));
          const head = split > 0 ? pts.slice(0, split + 1) : pts;
          const tail = split > 0 ? pts.slice(split) : [];
          return (
            <OverlaySvg box={box}>
              <FlarePath points={head} faint />
              <FlarePath points={tail} testID="card-path" />
              <CurrentDot point={tail[tail.length - 1] ?? null} />
            </OverlaySvg>
          );
        }}
      </Stage>
      {copy.cue ? (
        <Text testID="card-cue" style={[display(28), { position: 'absolute', left: inset.left, right: inset.right, top: inset.top, color: colors.text, lineHeight: 28, textShadowColor: '#000', textShadowRadius: 8 }]}>
          {copy.cue}
        </Text>
      ) : null}
      <View style={{ position: 'absolute', left: inset.left, top: inset.top + (copy.cue ? 64 : 0), backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2, paddingHorizontal: 6 }}>
        <Text testID="card-meta" style={{ color: colors.text, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
          {watermark ? `catchline · ${copy.meta}` : copy.meta}
        </Text>
      </View>
      <View
        testID="phase-strip"
        style={{ position: 'absolute', left: 0, right: 0, bottom: inset.bottom, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.7)', borderTopWidth: 1, borderTopColor: colors.hairline }}
      >
        {strip.map((p, i) => {
          const on = p.name === at?.phase;
          return (
            <View
              key={p.name}
              style={{
                flex: p.endFrame - p.startFrame,
                paddingVertical: 8,
                paddingHorizontal: 4,
                borderRightWidth: i < strip.length - 1 ? 1 : 0,
                borderRightColor: colors.hairline,
                backgroundColor: on ? colors.surface2 : 'transparent',
              }}
            >
              <Text numberOfLines={1} style={{ color: on ? colors.text : colors.text2, fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 14 }}>
                {`${phaseLabel(p.name).toLowerCase()} ${seconds(phaseSeconds(p, analysis.video.fps))}`}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function StuckCard({ analysis, aspect, options, watermark, coachHandle, stuck }: Props) {
  const box = cardSize('it_stuck', aspect);
  const inset = safeInsets(aspect, box);
  const half: Size = { width: box.width / 2, height: box.height };
  const src = { width: analysis.video.width, height: analysis.video.height };
  const meta = cardCopy(analysis, { ...options, cue: false }, coachHandle, false).meta;
  if (!stuck) return null;
  const sides = [
    { side: stuck.before, color: colors.text2, gray: true, opacity: 0.6, id: 'before' },
    { side: stuck.after, color: colors.flare, gray: false, opacity: 1, id: 'after' },
  ];
  return (
    <>
      <View style={{ flexDirection: 'row', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
        {sides.map((s) => (
          <View key={s.id} style={{ width: half.width, height: half.height }}>
            <Stage src={src} box={half} focus={{ x: 0.5, y: 0.32 }} zoom={1.25} zoomOrigin={{ x: 0.5, y: 0.32 }} layers={[{ image: s.side.image, gray: s.gray, opacity: s.opacity }]} style={{ backgroundColor: '#000' }} />
            <Text style={{ position: 'absolute', left: 12, top: inset.top + 12, color: s.color, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16, letterSpacing: 12 * 0.08 }}>
              {`${s.side.dateLabel} · ${s.side.value} ${stuck.unit}`}
            </Text>
          </View>
        ))}
      </View>
      <Fade from={0.5} to={0.8} />
      <View style={{ position: 'absolute', left: inset.left, right: inset.right, bottom: inset.bottom, gap: 6 }}>
        <Text testID="card-hero" style={[display(72, true), { color: colors.text, lineHeight: 62 }]}>
          Stuck.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Meta>{stuckLine(stuck)}</Meta>
            <Meta>{meta}</Meta>
          </View>
          <Mark size={22} />
        </View>
      </View>
      {watermark ? <Watermark text={watermark} top={inset.top} left={inset.left} /> : null}
    </>
  );
}

function Sticker({ analysis, options }: Props) {
  const box = cardSize('sticker', '4:5');
  const src = { width: analysis.video.width, height: analysis.video.height };
  const fit = coverFit(src, box, FOCUS);
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const ghost = keyFrameForPhase(rep, 'first_pull');
  const main = keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1];
  const images = [
    options.strobe && ghost ? { src: frameSource(ghost.image, true), opacity: 0.5, id: 'ghost' } : null,
    { src: frameSource(main?.image), opacity: 1, id: 'main' },
  ].filter((i): i is { src: NonNullable<ReturnType<typeof frameSource>>; opacity: number; id: string } => !!i?.src);
  return (
    <Svg width={box.width} height={box.height} testID="sticker">
      <Defs>
        <RadialGradient id="fade" cx="50%" cy="50%" rx="50%" ry="60%">
          <Stop offset="0.4" stopColor="#fff" stopOpacity={1} />
          <Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id="soft">
          <Rect x={0} y={0} width={box.width} height={box.height} fill="url(#fade)" />
        </Mask>
      </Defs>
      {images.map((i) => (
        <SvgImage key={i.id} href={i.src} x={fit.x} y={fit.y} width={fit.width} height={fit.height} opacity={i.opacity} mask="url(#soft)" preserveAspectRatio="xMidYMid slice" />
      ))}
      {options.path ? <FlarePath points={pathPoints(analysis, fit)} testID="card-path" /> : null}
    </Svg>
  );
}

const ShareCard = forwardRef<View, Props>(function ShareCard(props, ref) {
  const size = cardSize(props.type, props.aspect);
  const transparent = props.type === 'sticker';
  return (
    <View
      ref={ref}
      collapsable={false}
      testID={`share-card-${props.type}-${transparent ? 'sticker' : props.aspect}`}
      style={{ width: size.width, height: size.height, overflow: 'hidden', backgroundColor: transparent ? 'transparent' : '#000' }}
    >
      {props.type === 'strobe_card' ? <StrobeCard {...props} /> : null}
      {props.type === 'overlay_video' ? <OverlayVideoFrame {...props} /> : null}
      {props.type === 'it_stuck' ? <StuckCard {...props} /> : null}
      {props.type === 'sticker' ? <Sticker {...props} /> : null}
    </View>
  );
});

export default ShareCard;

// Dashed guides for the Reels/TikTok covered regions, shown on the preview only.
export function SafeAreaGuide({ aspect, type }: { aspect: Aspect; type: ShareType }) {
  const box = cardSize(type, aspect);
  const i = safeInsets(aspect, box);
  return (
    <View
      pointerEvents="none"
      testID="safe-area-guide"
      style={{
        position: 'absolute',
        left: i.left,
        top: i.top,
        right: i.right,
        bottom: i.bottom,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.text3,
      }}
    />
  );
}
