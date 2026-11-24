import { useEffect } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import { LEARN_LIFTS } from '../../src/features/learn/lifts';
import { EVENTS, track } from '../../src/lib/analytics';

// A Learn lift in the real player: every control the lifter's own lifts have, and no Share (the video is not theirs).
export default function LearnLiftRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const lift = LEARN_LIFTS.find((l) => l.id === id);
  useEffect(() => {
    if (lift) track(EVENTS.LEARN_OPENED, { lift: lift.id });
  }, [lift?.id]);
  if (!lift) return <Redirect href="/" />;
  return <TrackerScreen analysis={lift.analysis} clipUri={lift.clip} body={lift.body} title={lift.lifter} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
