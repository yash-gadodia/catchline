import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, radius, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { Body, DangerBtn, SheetTitle } from '../share/ui';
import { accountRepository, type AccountRepository } from './account';

export const CONFIRM_WORD = 'DELETE';

export function confirmed(text: string): boolean {
  return text.trim() === CONFIRM_WORD;
}

export default function DeleteAccountSheet({
  onKeep,
  onDeleted,
  repo = accountRepository,
}: {
  onKeep: () => void;
  onDeleted: () => void;
  repo?: AccountRepository;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = confirmed(text) && !busy;

  const del = async () => {
    setBusy(true);
    await repo.deleteAccount();
    onDeleted();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="delete-account">
      <Pressable style={{ flex: 1 }} onPress={onKeep} accessibilityLabel="Close" />
      <Sheet gap={16}>
        <SheetTitle>Delete your account?</SheetTitle>
        <Body>
          Every lift, cue and still is removed within 24 hours. Your subscription is cancelled through the App Store separately. This can't be
          undone.
        </Body>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>
            Type <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold }}>{CONFIRM_WORD}</Text> to confirm
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-confirm-input"
            style={{
              height: 52,
              borderWidth: 1,
              borderColor: colors.text,
              borderRadius: radius.control,
              paddingHorizontal: space.s3,
              color: colors.text,
              fontFamily: fontFamily.mono,
              fontSize: 17,
            }}
          />
        </View>
        <DangerBtn disabled={!ok} onPress={del} testID="delete-everything">
          {busy ? 'Deleting…' : 'Delete everything'}
        </DangerBtn>
        <Btn kind="secondary" onPress={onKeep} testID="keep-account">
          Keep my account
        </Btn>
      </Sheet>
    </View>
  );
}
