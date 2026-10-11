import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoClip } from '../../src/features/capture/demo';
import ReviewScreen from '../../src/features/capture/ReviewScreen';
import { newClip, useCapture } from '../../src/features/capture/store';
import { submitClip, toSubmission } from '../../src/features/capture/submit';
import { isMovement } from '../../src/features/onboarding/lifts';
import PrivacyScreen from '../../src/features/onboarding/PrivacyScreen';
import { hasConsent, useHydrated, useOnboarding } from '../../src/features/onboarding/store';
import { colors } from '../../src/design/tokens';

type Params = { uri?: string; from?: string; movement?: string; fps?: string; duration?: string };

// Share-sheet entry (stub). A share extension hands the shared video over as
// catchline://capture/share?uri=…&from=WhatsApp and lands straight on Review.
// Native setup it still needs: src/features/capture/share-sheet.md.
// With no uri it shows the design's sample (a WhatsApp HSPU clip).
export default function ShareRoute() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { draft, setDraft, updateDraft, setMovement, lastWeight } = useCapture();
  const units = useOnboarding((s) => s.units);
  const consent = useOnboarding((s) => s.consent);
  const acceptConsent = useOnboarding((s) => s.acceptConsent);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!params.uri) {
      setDraft(demoClip('share'));
      return;
    }
    const durationS = Number(params.duration ?? 0);
    setDraft(
      newClip({
        uri: params.uri,
        durationS,
        fps: params.fps ? Number(params.fps) : null,
        source: 'share',
        from: params.from,
        // TODO(on-device pose): guess the movement from the clip.
        movement: isMovement(params.movement) ? params.movement : useCapture.getState().movement,
        movementGuessed: isMovement(params.movement),
      })
    );
  }, [params.uri]);

  if (!hydrated || !draft || draft.source !== 'share') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!hasConsent(consent)) return <PrivacyScreen initialImprove={false} onContinue={acceptConsent} />;
  return (
    <ReviewScreen
      clip={draft}
      units={units}
      weight={lastWeight}
      onWeight={() => {}}
      onMovement={(m) => {
        setMovement(m);
        updateDraft({ movement: m, movementGuessed: false });
      }}
      onRetake={() => router.replace('/capture')}
      onTrim={() => router.push('/capture/trim')}
      onAnalyse={() => submitClip(toSubmission(draft, lastWeight, units))}
    />
  );
}
