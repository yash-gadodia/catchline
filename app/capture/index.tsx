import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RECORD_FPS, useCameraPermission } from '../../src/features/capture/camera';
import { fixedChecker, parseChecks, stubChecker } from '../../src/features/capture/checks';
import type { Session } from '../../src/features/capture/session';
import { deleteOriginals, secondsLeft } from '../../src/features/capture/storage';
import { newClip, useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import ViewfinderScreen from '../../src/features/capture/ViewfinderScreen';
import { groupOf } from '../../src/features/onboarding/lifts';
import { hasConsent, useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';
import { useLibrary } from '../../src/features/library/repository';
import { previousValue, targetLine } from '../../src/features/library/retest';
import { FREE_VIDEOS } from '../../src/features/library/types';

type Params = { checks?: string; state?: string; still?: string; left?: string; retest?: string };

// Dev links: ?still=1 (no camera), &checks=whole_body, &state=countdown|recording|toolong|storage.
function initialSession(state?: string, left?: string): Session {
  if (state === 'countdown') return { kind: 'countdown', n: 3 };
  if (state === 'recording') return { kind: 'recording', elapsed: 6 };
  if (state === 'toolong') return { kind: 'recording', elapsed: 31 };
  if (state === 'storage') return { kind: 'storage', secondsLeft: Number(left ?? 40) };
  return { kind: 'idle' };
}

export default function CaptureRoute() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const still = params.still === '1';
  const onboarded = useHydrated();
  const captureReady = useCaptureHydrated();
  const hydrated = onboarded && captureReady;
  const consent = useOnboarding((s) => s.consent);
  const camera = useCameraPermission();
  const { movement, setMovement, originals, setOriginals, setDraft, addOriginal } = useCapture();
  const checker = useMemo(() => (params.checks ? fixedChecker(parseChecks(params.checks)) : stubChecker), [params.checks]);
  const { cues, sessions, lifts, plan, freeVideosUsed } = useLibrary();
  const retest = cues.find((c) => c.id === params.retest && c.status === 'trying');

  // A retest films the cue's movement.
  useEffect(() => {
    if (retest && captureReady) setMovement(retest.movement);
  }, [retest?.id, captureReady]);

  const blocked = !still && (!hydrated || !hasConsent(consent) || !camera.ready || camera.status !== 'granted');

  useEffect(() => {
    if (still || !hydrated) return;
    if (!hasConsent(consent)) router.replace('/onboarding/privacy');
    else if (camera.ready && camera.status !== 'granted') router.replace('/onboarding/camera');
  }, [still, hydrated, consent, camera.ready, camera.status]);

  if (blocked) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <ViewfinderScreen
      movement={movement}
      onMovement={setMovement}
      checker={checker}
      fps={RECORD_FPS}
      freeUsed={plan === 'free' ? Math.min(freeVideosUsed, FREE_VIDEOS) : undefined}
      freeTotal={FREE_VIDEOS}
      secondsLeft={() => secondsLeft(RECORD_FPS)}
      originals={originals.length}
      onDeleteOriginals={() => setOriginals(deleteOriginals(originals))}
      onImport={() => router.push(retest ? { pathname: '/capture/import', params: { retest: retest.id } } : '/capture/import')}
      onGuide={() => router.push({ pathname: '/onboarding/guide', params: { group: groupOf(movement), from: 'capture' } })}
      onRecorded={({ uri, durationS, overridden }) => {
        if (uri) addOriginal(uri);
        const target = retest ? { retest: { cueId: retest.id, movement: retest.movement } } : {};
        setDraft(newClip({ uri, durationS, fps: RECORD_FPS, source: 'camera', movement, overridden, ...target }));
        router.push('/capture/review');
      }}
      target={retest && retest.movement === movement ? targetLine(retest, previousValue(retest, sessions, lifts)) : undefined}
      camera={!still}
      initial={initialSession(params.state, params.left)}
    />
  );
}
