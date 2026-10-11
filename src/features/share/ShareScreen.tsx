import { useRef, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import type { Analysis } from '../../analysis/types';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import ShareCard, { SafeAreaGuide } from './ShareCard';
import { useCoach } from './coachRepository';
import {
  overlayVideoRenderer,
  openInstagram,
  renderStill,
  saveImage,
  type OverlayVideoRenderer,
} from './exporter';
import {
  DEFAULT_OPTIONS,
  OPTIONS_FOR,
  SHARE_TYPES,
  aspectsFor,
  cardSize,
  exportLabel,
  exportSize,
  watermarkText,
  type Aspect,
  type ExportState,
  type ShareOption,
  type ShareOptions,
  type ShareType,
  type Stuck,
} from './model';
import { Body, Chip, SheetTitle } from './ui';

type Deps = {
  render: typeof renderStill;
  save: typeof saveImage;
  video: OverlayVideoRenderer;
  instagram: typeof openInstagram;
};

const DEFAULT_DEPS: Deps = { render: renderStill, save: saveImage, video: overlayVideoRenderer, instagram: openInstagram };

type Failure = 'render_error' | 'not_available';

export default function ShareScreen({
  analysis,
  pro,
  stuck,
  initialType = 'strobe_card',
  initialAspect = '9:16',
  initialState = 'idle',
  initialFailure = 'render_error',
  onBack,
  onSendToCoach,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  pro: boolean;
  stuck?: Stuck;
  initialType?: ShareType;
  initialAspect?: Aspect;
  initialState?: ExportState;
  initialFailure?: Failure;
  onBack: () => void;
  onSendToCoach: () => void;
  deps?: Deps;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const coach = useCoach();
  const ref = useRef<View>(null);
  const [type, setType] = useState<ShareType>(initialType);
  const [aspect, setAspect] = useState<Aspect>(initialAspect);
  const [options, setOptions] = useState<ShareOptions>(DEFAULT_OPTIONS);
  const [state, setState] = useState<ExportState>(initialState);
  const [failure, setFailure] = useState<Failure>(initialFailure);
  const [progress, setProgress] = useState(0.6);

  const watermark = watermarkText(analysis, pro);
  const size = cardSize(type, aspect);
  const maxW = width - space.gutter * 2;
  const maxH = 416;
  const scale = Math.min(maxW / size.width, maxH / size.height);
  const shown = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  const out = exportSize(type, aspect);

  const toggle = (o: ShareOption) => setOptions((prev) => ({ ...prev, [o]: !prev[o] }));

  const save = async (uri: string) => {
    const r = await deps.save(uri);
    setState(r === 'saved' ? 'saved' : 'idle');
  };

  const still = async () => {
    setState('rendering');
    setProgress(0);
    try {
      await save(await deps.render(ref, type, aspect));
    } catch {
      setFailure('render_error');
      setState('failed');
    }
  };

  const exportIt = async () => {
    if (type !== 'overlay_video') return still();
    setState('rendering');
    setProgress(0);
    const job = await deps.video.render(
      { analysisId: analysis.id, aspect, options, watermark, fps: 30 },
      setProgress
    );
    if (job.status === 'done') return save(job.uri);
    setFailure(job.status === 'failed' ? job.reason : 'render_error');
    setState('failed');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="share-screen">
      <TopBar
        back="Back"
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Share</Text>}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.s3, gap: 6 }}>
        {SHARE_TYPES.map((t) => (
          <Chip key={t.value} label={t.label} on={t.value === type} onPress={() => setType(t.value)} testID={`type-${t.value}`} />
        ))}
      </ScrollView>
      <View style={{ alignItems: 'center', paddingHorizontal: space.gutter }}>
        <View style={{ width: shown.width, height: shown.height, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline }} testID="share-preview">
          {type === 'sticker' ? <Checker width={shown.width} height={shown.height} /> : null}
          <View
            style={{
              position: 'absolute',
              left: (shown.width - size.width) / 2,
              top: (shown.height - size.height) / 2,
              width: size.width,
              height: size.height,
              transform: [{ scale }],
            }}
          >
            <ShareCard
              ref={ref}
              analysis={analysis}
              type={type}
              aspect={aspect}
              options={options}
              watermark={type === 'sticker' ? null : watermark}
              coachHandle={coach?.handle ?? null}
              stuck={stuck}
            />
            {type !== 'sticker' ? <SafeAreaGuide aspect={aspect} type={type} /> : null}
          </View>
        </View>
      </View>
      {aspectsFor(type).length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: space.s3, paddingHorizontal: space.gutter }}>
          {aspectsFor(type).map((a) => (
            <Chip key={a} label={a} mono on={a === aspect} onPress={() => setAspect(a)} testID={`aspect-${a}`} />
          ))}
        </View>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 6, paddingTop: space.s3, paddingHorizontal: space.gutter }}>
        {OPTIONS_FOR[type].map((o) => {
          const noCoach = o === 'coach' && !coach;
          return (
            <Chip
              key={o}
              label={o === 'coach' ? coach?.handle ?? '@coach' : o}
              on={options[o] && !noCoach}
              disabled={noCoach}
              onPress={() => toggle(o)}
              testID={`option-${o}`}
            />
          );
        })}
      </View>
      <View style={{ paddingTop: space.s3, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s2 }}>
        <Btn onPress={exportIt} testID="share-export">
          {exportLabel(type)}
        </Btn>
        <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, textAlign: 'center' }} testID="share-footnote">
          {watermark && type !== 'sticker' ? 'free: watermark carries the cue · upgrade to remove' : `${out.width} × ${out.height} · png`}
        </Text>
      </View>

      {state === 'rendering' ? (
        <Sheet gap={12} testID="share-rendering">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SheetTitle size={20}>{type === 'overlay_video' ? 'Rendering your video' : 'Rendering your card'}</SheetTitle>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>about 10 s</Text>
          </View>
          <View style={{ height: 2, backgroundColor: colors.hairline }}>
            <View testID="render-progress" style={{ height: 2, width: `${Math.round(progress * 100)}%`, backgroundColor: colors.flare }} />
          </View>
        </Sheet>
      ) : null}
      {state === 'saved' ? (
        <Sheet gap={16} testID="share-saved">
          <SheetTitle size={20}>Saved to Photos</SheetTitle>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Btn compact style={{ flex: 1 }} onPress={() => deps.instagram()} testID="open-instagram">
              Open Instagram
            </Btn>
            <Btn compact kind="secondary" style={{ flex: 1 }} onPress={onSendToCoach} testID="saved-send-coach">
              Send to coach
            </Btn>
          </View>
          <Btn kind="text" onPress={() => setState('idle')} testID="saved-done">
            Done
          </Btn>
        </Sheet>
      ) : null}
      {state === 'failed' ? (
        <Sheet gap={12} testID="share-failed">
          <SheetTitle size={20}>{failure === 'not_available' ? 'Video export is not ready yet' : "Couldn't render"}</SheetTitle>
          <Body>
            {failure === 'not_available'
              ? 'Nothing to do with your lift. Save this frame as a still for now.'
              : 'Nothing to do with your lift. Try again, or save the still instead.'}
          </Body>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            {failure === 'not_available' ? (
              <Btn compact style={{ flex: 1 }} onPress={() => setState('idle')} testID="failed-close">
                Close
              </Btn>
            ) : (
              <Btn compact style={{ flex: 1 }} onPress={exportIt} testID="failed-retry">
                Try again
              </Btn>
            )}
            <Btn compact kind="secondary" style={{ flex: 1 }} onPress={still} testID="failed-still">
              Save still
            </Btn>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

function Checker({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <Pattern id="checker" width={24} height={24} patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={24} height={24} fill={colors.surface} />
          <Rect x={0} y={0} width={12} height={12} fill={colors.surface2} />
          <Rect x={12} y={12} width={12} height={12} fill={colors.surface2} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#checker)" />
    </Svg>
  );
}
