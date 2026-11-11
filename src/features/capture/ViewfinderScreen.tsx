import { useEffect, useReducer, useRef } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { frameSource } from '../../analysis/frames';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, shade, shape, space, stroke } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { DestructiveBtn, Note } from '../onboarding/ui';
import { CameraSurface, type CameraHandle } from './camera';
import { failing, firstHint, useFramingChecks, type CheckId, type FramingChecker } from './checks';
import { CheckList, HudBadge, RecordButton } from './hud';
import { MAX_RECORD_S, clock, isTooLong, reduce, type Session } from './session';
import { getLocale, t } from '../../i18n';

export type Recorded = { uri: string | null; durationS: number; overridden: CheckId[] };

const PREVIEW_FRAME = 'asset:snatch/1-setup';

export default function ViewfinderScreen({
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
  camera = true,
  initial = { kind: 'idle' },
  speak = (text: string) => Speech.speak(text, { language: getLocale() }),
}: {
  checker: FramingChecker;
  fps: number;
  // Free plan only; a paid plan has no free-video count to show.
  freeUsed?: number;
  freeTotal: number;
  secondsLeft: () => number;
  originals: number;
  onDeleteOriginals: () => void;
  onImport: () => void;
  onGuide: () => void;
  onRecorded: (r: Recorded) => void;
  // false: no camera (simulator, design QA), show a still frame instead.
  camera?: boolean;
  initial?: Session;
  speak?: (text: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [session, dispatch] = useReducer(reduce, initial);
  const cam = useRef<CameraHandle>(null);
  const stopFake = useRef<(() => void) | null>(null);
  const elapsed = useRef(0);
  const overridden = useRef<CheckId[]>([]);
  const results = useFramingChecks(checker, session.kind === 'idle' || session.kind === 'countdown');
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
      onRecorded({ uri, durationS: Math.max(elapsed.current, 1), overridden: overridden.current });
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
      {dim ? <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: shade(0.55) }} /> : null}

      {session.kind === 'idle' ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: insets.top + space.s3,
              left: space.gutter,
              right: space.gutter,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: space.s2,
            }}
          >
            <HudBadge testID="fps-badge">{t('capture.viewfinder.fps', { fps })}</HudBadge>
            <HudBadge square onPress={onGuide} testID="guide-button">
              ?
            </HudBadge>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 64, left: space.gutter }}>
            <CheckList results={results} />
          </View>
          {hint ? (
            <Note scrim testID="check-hint" style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 200 + insets.bottom }}>
              {hint}
            </Note>
          ) : (
            <Note scrim testID="framing-guide" style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 200 + insets.bottom }}>
              {t('capture.viewfinder.framingGuide')}
            </Note>
          )}
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
          {isTooLong(session) ? null : <HudBadge>{t('capture.viewfinder.fps', { fps })}</HudBadge>}
        </View>
      ) : null}

      {session.kind === 'countdown' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text
            testID="countdown"
            style={[
              display(240, true),
              { color: colors.text, textShadowColor: colors.halo, textShadowRadius: 24, textShadowOffset: { width: 0, height: 0 } },
            ]}
          >
            {String(session.n)}
          </Text>
        </View>
      ) : null}

      {isTooLong(session) ? (
        <Note
          scrim
          title={t('capture.viewfinder.tooLongTitle')}
          testID="too-long"
          style={{ position: 'absolute', left: space.gutter, right: space.gutter, bottom: 200 + insets.bottom }}
        >
          {t('capture.viewfinder.tooLongBody')}
        </Note>
      ) : null}

      {session.kind !== 'storage' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          {session.kind === 'idle' || (recording && !isTooLong(session)) ? (
            <LinearGradient
              colors={[shade(0), shade(0.9), shade(0.9)]}
              locations={[0, 0.4, 1]}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 + insets.bottom }}
              pointerEvents="none"
            />
          ) : null}
          <View style={{ alignItems: 'center', gap: 20, paddingBottom: Math.max(insets.bottom, space.s4) + space.s5 }}>
            {session.kind === 'countdown' ? <Text style={[type.label, { color: colors.text2 }]}>{t('capture.viewfinder.getSet')}</Text> : null}
            {recording && !isTooLong(session) ? (
              <View style={{ alignItems: 'center', gap: space.s2 }}>
                <Text style={[display(28), { color: colors.text }]}>{t('capture.viewfinder.liftWhenReady')}</Text>
                <Text style={{ color: colors.text2, ...type.readout }}>{t('capture.viewfinder.stopAfterLast')}</Text>
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
                    ...shape.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* design-ok: 11pt label inside the 44pt import tile; no type token this small */}
                  <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 11, lineHeight: 14 }}>{t('capture.viewfinder.import')}</Text>
                </Pressable>
              ) : (
                <View style={{ width: 44 }} />
              )}
              <RecordButton recording={recording} onPress={press} />
              {session.kind === 'idle' && freeUsed != null ? (
                <Text
                  testID="free-count"
                  accessibilityLabel={t('capture.viewfinder.freeA11y', { used: freeUsed, total: freeTotal })}
                  style={{ width: 44, textAlign: 'center', color: colors.text2, ...type.readout }}
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
          <Text style={[type.title, { color: colors.text }]}>{t('capture.viewfinder.storageTitle')}</Text>
          <Text style={[type.body, { color: colors.text2 }]}>
            {t('capture.viewfinder.storageBody', { seconds: session.secondsLeft, fps })}
          </Text>
          {originals > 0 ? (
            <DestructiveBtn
              testID="delete-originals"
              onPress={() => {
                onDeleteOriginals();
                dispatch({ type: 'dismissStorage' });
              }}
            >
              {t('capture.viewfinder.deleteOriginals', { count: originals })}
            </DestructiveBtn>
          ) : null}
          <Btn kind="secondary" onPress={() => dispatch({ type: 'recordAnyway' })} testID="record-anyway">
            {t('capture.viewfinder.recordAnyway')}
          </Btn>
        </Sheet>
      ) : null}

    </View>
  );
}
