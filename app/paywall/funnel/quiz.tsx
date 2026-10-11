import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import QuizScreen from '../../../src/features/paywall/QuizScreen';
import { useUsage } from '../../../src/features/paywall/usageStore';

// Ad-traffic entry: the quiz marks this install as the ad variant, so the one free
// analysis comes next and `trialDue` sends the lifter to /paywall/funnel/trial after it.
export default function QuizRoute() {
  const router = useRouter();
  useEffect(() => {
    useUsage.getState().setVariant('ad');
  }, []);
  return <QuizScreen onDone={() => router.replace('/analysis/processing')} />;
}
