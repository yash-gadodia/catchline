import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { control, radius, space } from '../../design/tokens';
import { Body, Note, Screen, Title } from './ui';
import { t } from '../../i18n';

export function accountCopy() {
  return {
    title: t('onboarding.account.title'),
    body: t('onboarding.account.body'),
    skip: t('onboarding.account.skip'),
    failed: t('onboarding.account.failed'),
  };
}

// onApple resolves true once signed in, false when the lifter backed out of the
// Apple sheet, and rejects when the sign-in failed.
export default function AccountScreen({ onApple, onSkip }: { onApple: () => Promise<boolean>; onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = accountCopy();

  const apple = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onApple();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top={insets.top} bottom={insets.bottom} testID="account-screen">
      <Title>{copy.title}</Title>
      <Body>{copy.body}</Body>
      <View style={{ flex: 1 }} />
      {failed ? <Note blocked testID="account-failed">{copy.failed}</Note> : null}
      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.control}
          style={{ height: control.height, opacity: busy ? 0.6 : 1 }}
          onPress={apple}
          testID="account-apple"
        />
      ) : null}
      <View style={{ alignItems: 'center', paddingTop: space.s2 }}>
        <Btn kind="text" onPress={onSkip} testID="account-skip">
          {copy.skip}
        </Btn>
      </View>
    </Screen>
  );
}
