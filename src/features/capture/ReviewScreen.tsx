import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Movement } from '../../analysis/types';
import Btn from '../../components/Btn';
import { colors, radius, space, stroke } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { liftById } from '../onboarding/lifts';
import type { Units } from '../onboarding/store';
import { GateBtn, Note } from '../onboarding/ui';
import { CHECK_ORDER, CHECK_OVERRIDE } from './checks';
import ClipPlayer from './ClipPlayer';
import { Header, LiftChip, Meta, Underlined } from './hud';
import LiftSheet from './LiftSheet';
import { clock } from './session';
import type { Clip } from './store';

export function clipMeta(clip: Clip): string {
  const parts = [clock(clip.durationS)];
  if (clip.fps) parts.push(`${clip.fps} fps`);
  if (clip.repsFound) parts.push(`${clip.repsFound} rep${clip.repsFound === 1 ? '' : 's'} found`);
  return parts.join(' · ');
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
  const shared = clip.source === 'share';
  const stageH = Math.min(Math.round(width * 1.25), 488);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
      testID="review-screen"
    >
      <Header
        left={shared ? <Meta>{`from ${clip.from ?? 'another app'}`}</Meta> : <Underlined onPress={onRetake} testID="review-retake">Retake</Underlined>}
        right={<Meta testID="review-meta">{shared || cutOff || override ? clipMeta({ ...clip, repsFound: null }) : clipMeta(clip)}</Meta>}
      />
      <ClipPlayer uri={clip.uri} trim={clip.trim} durationS={clip.durationS} width={width} height={stageH} progress={!cutOff}>
        {cutOff ? (
          <View style={{ position: 'absolute', left: space.gutter, bottom: space.s5 }}>
            <Text testID="cut-off-marker" style={{ color: colors.flare, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
              {`clip ends here · frame ${clip.cutOffFrame}`}
            </Text>
          </View>
        ) : null}
      </ClipPlayer>

      {cutOff ? (
        <Note blocked title="Clip stopped before the catch" testID="cut-off-note" style={{ marginTop: space.s4, marginHorizontal: space.gutter }}>
          The lift isn't finished, so there's nothing to compare. Film the whole rep, including a second after the lockout.
        </Note>
      ) : override ? (
        <Note title={CHECK_OVERRIDE[override].title} testID="override-note" style={{ marginTop: space.s4, marginHorizontal: space.gutter }}>
          {CHECK_OVERRIDE[override].body}
        </Note>
      ) : (
        <View style={{ paddingHorizontal: space.gutter, paddingVertical: space.s4, gap: space.s3 }}>
          {shared && clip.movementGuessed ? (
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
              {`Looks like ${liftById(clip.movement).spoken}. Right?`}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 }}>
            <LiftChip movement={clip.movement} onPress={() => setPicking(true)} />
            {shared ? null : <WeightField value={weight} units={units} onChange={onWeight} />}
            <Underlined onPress={onTrim} testID="review-trim">
              Adjust trim
            </Underlined>
          </View>
          {clip.fps != null && clip.fps < 60 && shared ? (
            <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
              {`${clip.fps} fps clip · timing will be rougher than 60`}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s3 }}>
        {cutOff ? (
          <>
            <Btn onPress={onRetake} testID="review-retake-primary">
              Retake
            </Btn>
            <GateBtn disabled onPress={onAnalyse} testID="review-analyse">
              Analyse
            </GateBtn>
          </>
        ) : override ? (
          <>
            <Btn onPress={onAnalyse} testID="review-analyse">
              Analyse anyway
            </Btn>
            <Btn kind="secondary" onPress={onRetake} testID="review-retake-secondary">
              Retake
            </Btn>
          </>
        ) : (
          <Btn onPress={onAnalyse} testID="review-analyse">
            Analyse
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
        borderRadius: radius.control,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s2,
      }}
    >
      <TextInput
        testID="weight-input"
        accessibilityLabel={`Weight in ${units}`}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.text3}
        maxLength={6}
        style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, minWidth: 36, padding: 0, textAlign: 'right' }}
      />
      <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}>{units}</Text>
    </View>
  );
}
