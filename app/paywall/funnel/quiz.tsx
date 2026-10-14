import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import QuizScreen from '../../../src/features/paywall/QuizScreen';
import { useUsage } from '../../../src/features/paywall/usageStore';
import { submitDraft } from '../../../src/features/capture/submit';

// Ad-traffic entry: the quiz marks this install as the ad variant, so the one free
// analysis comes next and `trialDue` sends the lifter to /paywall/funnel/trial after it.
// The free analysis is the clip the lifter already picked, when there is one.
export default function QuizRoute() {
  const router = useRouter();
  useEffect(() => {
    useUsage.getState().setVariant('ad');
  }, []);
  return (
    <QuizScreen
      onDone={() => {
        if (!submitDraft({ replace: true })) router.replace('/analysis/processing');
      }}
    />
  );
}
