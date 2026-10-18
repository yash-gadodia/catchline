import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Movement } from '../../analysis/types';
import type { PoseResult } from '../../../modules/pose-coreml';
import Btn from '../../components/Btn';
import { framingPose } from '../../data/framingCheck';
import { colors, shape, space, stroke } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { EVENTS, track } from '../../lib/analytics';
import { liftById } from '../onboarding/lifts';
import type { Units } from '../onboarding/store';
import { GateBtn, Note } from '../onboarding/ui';
import { CHECK_ORDER, checkOverride } from './checks';
import ClipPlayer from './ClipPlayer';
import { assessFraming, roundedDeg, type Framing } from './framing';
import { Header, LiftChip, Meta, Underlined } from './hud';
import LiftSheet from './LiftSheet';
import { clock } from './session';
import type { Clip } from './store';
import { t } from '../../i18n';

export function clipMeta(clip: Clip): string {
  const parts = [clock(clip.durationS)];
  if (clip.fps) parts.push(t('capture.review.fps', { fps: clip.fps }));
  if (clip.repsFound) parts.push(t('capture.review.repsFound', { count: clip.repsFound }));
  return parts.join(' · ');
}

// The setup frames of the clip, checked for camera angle and a whole body before upload. null while it runs,
// when it is off or fails, or when the clip has no file (the bundled sample).
export function useFraming(clip: Clip): Framing | null {
  const [pose, setPose] = useState<PoseResult | null>(null);
  useEffect(() => {
    setPose(null);
    if (!clip.uri) return;
    let live = true;
    const started = Date.now();
    void framingPose(clip.uri, clip.trim.start, clip.trim.end).then((p) => {
      if (!live) return;
      setPose(p);
      const f = p ? assessFraming(p, clip.movement) : null;
      track(EVENTS.FRAMING_CHECKED, {
        result: f ? f.kind : 'skipped',
        ...(f && 'offDeg' in f && f.offDeg != null ? { off_deg: Math.round(f.offDeg) } : {}),
        movement: clip.movement,
        source: clip.source,
        ms: Date.now() - started,
      });
    });
    return () => {
      live = false;
    };
  }, [clip.uri, clip.trim.start]);
  return useMemo(() => (pose ? assessFraming(pose, clip.movement) : null), [pose, clip.movement]);
}

export function framingNote(f: Framing): { title: string; body: string } | null {
  if (f.kind === 'cut_off') return { title: t('capture.review.framing.cutOffTitle'), body: t('capture.review.framing.cutOffBody') };
  if (f.kind === 'side_on') {
    return { title: t('capture.review.framing.angleTitle', { deg: roundedDeg(f.offDeg) }), body: t('capture.review.framing.angleBody') };
  }
  return null;
}

export default function ReviewScreen({
  clip,
  units,
  weight,
  onWeight,
  onMovement,
  onRetake,
  onTrim,
  onAnalyse,
}: {
  clip: Clip;
  units: Units;
  weight: string;
  onWeight: (w: string) => void;
  onMovement: (m: Movement) => void;
  onRetake: () => void;
  onTrim: () => void;
  onAnalyse: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);
  const cutOff = clip.cutOffFrame != null;
  const override = CHECK_ORDER.find((c) => clip.overridden.includes(c));
  const framing = useFraming(clip);
  const refilm = !cutOff && framing ? framingNote(framing) : null;
  const shared = clip.source === 'share';
  const stageH = Math.min(Math.round(width * 1.25), 488);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
      testID="review-screen"
    >
      <Header
        left={shared ? <Meta>{t('capture.review.from', { app: clip.from ?? t('capture.review.anotherApp') })}</Meta> : <Underlined onPress={onRetake} testID="review-retake">{t('capture.review.retake')}</Underlined>}
        right={<Meta testID="review-meta">{shared || cutOff || override || refilm ? clipMeta({ ...clip, repsFound: null }) : clipMeta(clip)}</Meta>}
      />
      <ClipPlayer uri={clip.uri} trim={clip.trim} durationS={clip.durationS} width={width} height={stageH} progress={!cutOff}>
        {cutOff ? (
          <View style={{ position: 'absolute', left: space.gutter, bottom: space.s5 }}>
            <Text testID="cut-off-marker" style={{ color: colors.flare, ...type.readout }}>
              {t('capture.review.cutOffMarker', { frame: clip.cutOffFrame ?? 0 })}
            </Text>
          </View>
        ) : null}
      </ClipPlayer>

      {cutOff ? (
        <Note blocked title={t('capture.review.cutOffTitle')} testID="cut-off-note" style={{ marginTop: space.s4, marginHorizontal: space.gutter }}>
          {t('capture.review.cutOffBody')}
        </Note>
      ) : refilm ? (
        <Note blocked title={refilm.title} testID="framing-note" style={{ marginTop: space.s4, marginHorizontal: space.gutter }}>
          {refilm.body}
        </Note>
      ) : override ? (
        <Note title={checkOverride(override).title} testID="override-note" style={{ marginTop: space.s4, marginHorizontal: space.gutter }}>
          {checkOverride(override).body}
        </Note>
      ) : (
        <View style={{ paddingHorizontal: space.gutter, paddingVertical: space.s4, gap: space.s3 }}>
          {shared && clip.movementGuessed ? (
            <Text style={{ color: colors.text2, ...type.callout }}>
              {t('capture.review.looksLike', { lift: liftById(clip.movement).spoken })}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 }}>
            <LiftChip movement={clip.movement} onPress={() => setPicking(true)} />
            {shared ? null : <WeightField value={weight} units={units} onChange={onWeight} />}
            <Underlined onPress={onTrim} testID="review-trim">
              {t('capture.import.adjustTrim')}
            </Underlined>
          </View>
          {clip.fps != null && clip.fps < 60 && shared ? (
            <Text style={{ color: colors.text3, ...type.readout }}>
              {t('capture.review.lowFps', { fps: clip.fps })}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s3 }}>
        {cutOff ? (
          <>
            <Btn onPress={onRetake} testID="review-retake-primary">
              {t('capture.review.retake')}
            </Btn>
            <GateBtn disabled onPress={onAnalyse} testID="review-analyse">
              {t('capture.review.analyse')}
            </GateBtn>
          </>
        ) : refilm ? (
          <>
            <Btn onPress={onRetake} testID="review-film-again">
              {t('capture.review.framing.filmAgain')}
            </Btn>
            <Btn kind="secondary" onPress={onAnalyse} testID="review-analyse">
              {t('capture.review.analyseAnyway')}
            </Btn>
          </>
        ) : override ? (
          <>
            <Btn onPress={onAnalyse} testID="review-analyse">
              {t('capture.review.analyseAnyway')}
            </Btn>
            <Btn kind="secondary" onPress={onRetake} testID="review-retake-secondary">
              {t('capture.review.retake')}
            </Btn>
          </>
        ) : (
          <Btn onPress={onAnalyse} testID="review-analyse">
            {t('capture.review.analyse')}
          </Btn>
        )}
      </View>

      {picking ? (
        <LiftSheet
          value={clip.movement}
          onPick={(m) => {
            onMovement(m);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function WeightField({ value, units, onChange }: { value: string; units: Units; onChange: (w: string) => void }) {
  return (
    <View
      style={{
        height: 40,
        paddingHorizontal: space.s3,
        borderWidth: stroke.hairline,
        borderColor: colors.hairline,
        ...shape.control,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s2,
      }}
    >
      <TextInput
        testID="weight-input"
        accessibilityLabel={t('capture.review.weightA11y', { units })}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.text3}
        maxLength={6}
        // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
        style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, minWidth: 36, padding: 0, textAlign: 'right' }}
      />
      <Text style={{ color: colors.text2, ...type.label, fontFamily: fontFamily.body }}>{units}</Text>
    </View>
  );
}
