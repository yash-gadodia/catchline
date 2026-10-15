import { useEffect, useReducer, useRef, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import type { Movement } from '../../analysis/types';
import { frameSource } from '../../analysis/frames';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import Sheet from '../../components/Sheet';
import { colors, radius, space, stroke } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { DestructiveBtn, Note } from '../onboarding/ui';
import { CameraSurface, type CameraHandle } from './camera';
import { failing, firstHint, useFramingChecks, type CheckId, type FramingChecker } from './checks';
import { CheckList, HudBadge, LiftChip, RecordButton } from './hud';
import LiftSheet from './LiftSheet';
import { MAX_RECORD_S, clock, isTooLong, reduce, type RepsMode, type Session } from './session';
import Silhouette from './Silhouette';

export type Recorded = { uri: string | null; durationS: number; overridden: CheckId[]; mode: RepsMode };

const PREVIEW_FRAME = 'asset:snatch/1-setup';

export default function ViewfinderScreen({
  movement,
  onMovement,
  checker,
  fps,
  freeUsed,
  freeTotal,
  secondsLeft,
  originals,
  onDeleteOriginals,
  onImport,
  onGuide,
  onRecorded,
  target,
  camera = true,
  initial = { kind: 'idle' },
  speak = (t: string) => Speech.speak(t),
}: {
  movement: Movement;
  onMovement: (m: Movement) => void;
  checker: FramingChecker;
  fps: number;
  freeUsed: number;
  freeTotal: number;
  secondsLeft: () => number;
  originals: number;
  onDeleteOriginals: () => void;
  onImport: () => void;
  onGuide: () => void;
  onRecorded: (r: Recorded) => void;
  // A retest: the cue and the number to beat, one line over the shutter.
  target?: string;
  // false: no camera (simulator, design QA), show a still frame instead.
  camera?: boolean;
  initial?: Session;
  speak?: (text: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [session, dispatch] = useReducer(reduce, initial);
  const [mode, setMode] = useState<RepsMode>('set');
  const [picking, setPicking] = useState(false);
  const cam = useRef<CameraHandle>(null);
  const stopFake = useRef<(() => void) | null>(null);
  const elapsed = useRef(0);
  const overridden = useRef<CheckId[]>([]);
  const results = useFramingChecks(checker, movement, session.kind === 'idle' || session.kind === 'countdown');
  const hint = firstHint(results);

  useEffect(() => {
    if (session.kind === 'countdown') {
      speak(String(session.n));
      const t = setTimeout(() => dispatch({ type: 'tick' }), 1000);
      return () => clearTimeout(t);
    }
    if (session.kind === 'recording') {
      elapsed.current = session.elapsed;
      const t = setTimeout(() => dispatch({ type: 'tick' }), 1000);
      return () => clearTimeout(t);
    }
    if (session.kind === 'stopping') {
      if (stopFake.current) stopFake.current();
      else cam.current?.stop();
    }
  }, [session]);

  const recording = session.kind === 'recording' || session.kind === 'stopping';
  useEffect(() => {
    if (session.kind !== 'recording') return;
    overridden.current = failing(results);
    const take: Promise<string | null> =
      camera && cam.current
        ? cam.current.record(MAX_RECORD_S)
        : new Promise((resolve) => {
            stopFake.current = () => resolve(null);
          });
    take.then((uri) => {
      stopFake.current = null;
      onRecorded({ uri, durationS: Math.max(elapsed.current, 1), overridden: overridden.current, mode });
      dispatch({ type: 'cancel' });
    });
  }, [session.kind]);

  useEffect(() => () => void Speech.stop(), []);

  const press = () => dispatch({ type: 'press', secondsLeft: secondsLeft() });
  const dim = session.kind === 'countdown' || session.kind === 'storage' || isTooLong(session);

  return (
    <View testID="viewfinder" style={{ flex: 1, backgroundColor: colors.bg }}>
      {camera ? (
        <CameraSurface ref={cam} active style={{ position: 'absolute', left: 0, top: 0, width, height }} />
      ) : (
        <Image
          testID="viewfinder-still"
          source={frameSource(PREVIEW_FRAME) ?? undefined}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
      )}
      {dim ? <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: 'rgba(0,0,0,0.55)' }} /> : null}
      {session.kind === 'idle' ? <Silhouette movement={movement} width={width} height={height} /> : null}

      {session.kind === 'idle' ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: insets.top + space.s3,
              left: space.gutter,
              right: space.gutter,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <LiftChip movement={movement} onPress={() => setPicking(true)} scrim height={36} />
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              <HudBadge testID="fps-badge">{`${fps} fps`}</HudBadge>
              <HudBadge square onPress={onGuide} testID="guide-button">
                ?
              </HudBadge>
            </View>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 64, left: space.gutter }}>
            <CheckList results={results} />
          </View>
          {hint ? (
            <Note scrim testID="check-hint" style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 200 + insets.bottom }}>
              {hint}
            </Note>
          ) : null}
        </>
      ) : null}

      {recording ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + space.s3,
            left: space.gutter,
            right: space.gutter,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <HudBadge dot testID="record-timer">
            {clock(session.elapsed)}
          </HudBadge>
          {isTooLong(session) ? null : <HudBadge>{`${fps} fps`}</HudBadge>}
        </View>
      ) : null}

      {session.kind === 'countdown' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text
            testID="countdown"
            style={[
              display(240, true),
              { color: colors.text, textShadowColor: '#000', textShadowRadius: 24, textShadowOffset: { width: 0, height: 0 } },
            ]}
          >
            {String(session.n)}
          </Text>
        </View>
      ) : null}

      {isTooLong(session) ? (
        <Note
          scrim
          title="Over 30 seconds"
          testID="too-long"
          style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 200 + insets.bottom }}
        >
          We analyse one set per clip. Stop here and we'll trim to the reps, or keep going and pick the set on the next screen.
        </Note>
      ) : null}

      {session.kind !== 'storage' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          {session.kind === 'idle' || (recording && !isTooLong(session)) ? (
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,0.9)']}
              locations={[0, 0.4, 1]}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 + insets.bottom }}
              pointerEvents="none"
            />
          ) : null}
          <View style={{ alignItems: 'center', gap: 20, paddingBottom: Math.max(insets.bottom, space.s4) + space.s5 }}>
            {target && session.kind === 'idle' ? (
              <Text testID="retest-target" numberOfLines={2} style={[type.label, { color: colors.text, textAlign: 'center', paddingHorizontal: space.gutter }]}>
                {target}
              </Text>
            ) : null}
            {session.kind === 'idle' ? (
              <Segmented
                testID="reps-mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'rep', label: '1 rep' },
                  { value: 'set', label: 'Set' },
                ]}
              />
            ) : null}
            {session.kind === 'countdown' ? <Text style={[type.label, { color: colors.text2 }]}>Get set</Text> : null}
            {recording && !isTooLong(session) ? (
              <View style={{ alignItems: 'center', gap: space.s2 }}>
                <Text style={[display(28), { color: colors.text }]}>Lift when ready</Text>
                {/* TODO(on-device pose): auto-stop after the lockout in 1-rep mode. */}
                <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
                  {mode === 'rep' ? 'tap stop a second after the lockout' : 'tap stop after your last rep'}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 56 }}>
              {session.kind === 'idle' ? (
                <Pressable
                  onPress={onImport}
                  testID="import-button"
                  accessibilityRole="button"
                  style={{
                    width: 44,
                    height: 44,
                    borderWidth: stroke.hairline,
                    borderColor: colors.text,
                    borderRadius: radius.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 11, lineHeight: 14 }}>Import</Text>
                </Pressable>
              ) : (
                <View style={{ width: 44 }} />
              )}
              <RecordButton recording={recording} onPress={press} />
              {session.kind === 'idle' ? (
                <Text
                  testID="free-count"
                  accessibilityLabel={`${freeUsed} of ${freeTotal} free videos used`}
                  style={{ width: 44, textAlign: 'center', color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}
                >
                  {`${freeUsed} / ${freeTotal}`}
                </Text>
              ) : (
                <View style={{ width: 44 }} />
              )}
            </View>
          </View>
        </View>
      ) : null}

      {session.kind === 'storage' ? (
        <Sheet testID="storage-sheet" gap={space.s4}>
          <Text style={[type.title, { color: colors.text }]}>Storage is nearly full</Text>
          <Text style={[type.body, { color: colors.text2 }]}>
            {`About ${session.secondsLeft} seconds of ${fps} fps video left. Catchline keeps your analyses; original clips can go.`}
          </Text>
          {originals > 0 ? (
            <DestructiveBtn
              testID="delete-originals"
              onPress={() => {
                onDeleteOriginals();
                dispatch({ type: 'dismissStorage' });
              }}
            >
              {`Delete ${originals} original clip${originals === 1 ? '' : 's'}, keep analyses`}
            </DestructiveBtn>
          ) : null}
          <Btn kind="secondary" onPress={() => dispatch({ type: 'recordAnyway' })} testID="record-anyway">
            Record anyway
          </Btn>
        </Sheet>
      ) : null}

      {picking ? (
        <LiftSheet
          value={movement}
          onPick={(m) => {
            onMovement(m);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}
