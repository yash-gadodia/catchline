import { useLocalSearchParams, useRouter } from 'expo-router';
import GuideScreen from '../../src/features/onboarding/GuideScreen';
import { groupOf, isMovement, type LiftGroup } from '../../src/features/onboarding/lifts';
import { useOnboarding } from '../../src/features/onboarding/store';
import { useFlow } from '../../src/features/onboarding/useFlow';

// `?from=capture` opens it from the viewfinder's "?" and just closes again.
export default function GuideRoute() {
  const { group, movement, from } = useLocalSearchParams<{ group?: string; movement?: string; from?: string }>();
  const router = useRouter();
  const { go } = useFlow('film');
  const lifts = useOnboarding((s) => s.lifts);
  const hideGuide = useOnboarding((s) => s.hideGuide);
  const first = isMovement(movement) ? movement : lifts[0];
  const g: LiftGroup = group === 'gymnastics' || group === 'barbell' ? group : first ? groupOf(first) : 'barbell';
  if (from === 'capture') return <GuideScreen group={g} onDone={() => router.back()} />;
  return (
    <GuideScreen
      group={g}
      onDone={() => go('guide')}
      onHide={() => {
        hideGuide();
        go('guide', { guideHidden: true });
      }}
    />
  );
}
