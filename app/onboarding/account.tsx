import { useLocalSearchParams } from 'expo-router';
import { signInWithApple } from '../../src/features/auth/appleSignIn';
import AccountScreen from '../../src/features/onboarding/AccountScreen';
import { useOnboarding } from '../../src/features/onboarding/store';
import { parseIntent, useFlow } from '../../src/features/onboarding/useFlow';

export default function AccountRoute() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { go } = useFlow(parseIntent(intent));
  const setAccountChoice = useOnboarding((s) => s.setAccountChoice);
  return (
    <AccountScreen
      onApple={async () => {
        const result = await signInWithApple();
        if (result.cancelled) return false;
        setAccountChoice('apple');
        go('account', { accountDecided: true });
        return true;
      }}
      onSkip={() => {
        setAccountChoice('none');
        go('account', { accountDecided: true });
      }}
    />
  );
}
