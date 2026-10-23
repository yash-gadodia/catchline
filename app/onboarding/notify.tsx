import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import NotifyScreen from '../../src/features/onboarding/NotifyScreen';
import { parseIntent, useFlow } from '../../src/features/onboarding/useFlow';
import { askForPush, pushStatus, usePushAsk, type PushStatus } from '../../src/features/notifications/ask';

export default function NotifyRoute() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { go } = useFlow(parseIntent(intent));
  const [status, setStatus] = useState<PushStatus>('undetermined');
  const next = () => {
    usePushAsk.setState({ onboarded: true });
    go('notify', { notifyDecided: true });
  };
  useEffect(() => {
    pushStatus().then((s) => (s === 'granted' ? next() : setStatus(s)));
  }, []);
  return (
    <NotifyScreen
      denied={status === 'denied'}
      onAllow={async () => {
        await askForPush();
        next();
      }}
      onSkip={next}
    />
  );
}
