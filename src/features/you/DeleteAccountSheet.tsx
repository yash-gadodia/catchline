import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, radius, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { Body, DangerBtn, SheetTitle } from '../share/ui';
import { accountRepository, type AccountRepository } from './account';
import { t } from '../../i18n';

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
  const [failed, setFailed] = useState(false);
  const ok = confirmed(text) && !busy;

  const del = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await repo.deleteAccount();
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    onDeleted();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="delete-account">
      <Pressable style={{ flex: 1 }} onPress={onKeep} accessibilityLabel={t('you.close')} />
      <Sheet gap={16}>
        <SheetTitle>{t('you.delete.title')}</SheetTitle>
        <Body>
          {t('you.delete.body')}
        </Body>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text2, ...type.small }}>
            {t('you.delete.typeBefore')} <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold }}>{CONFIRM_WORD}</Text> {t('you.delete.typeAfter')}
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
              // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
              fontSize: 17,
            }}
          />
        </View>
        {failed ? (
          <Body color={colors.flare} testID="delete-error">
            {t('you.delete.error')}
          </Body>
        ) : null}
        <DangerBtn disabled={!ok} onPress={del} testID="delete-everything">
          {busy ? t('you.delete.deleting') : t('you.delete.confirm')}
        </DangerBtn>
        <Btn kind="secondary" onPress={onKeep} testID="keep-account">
          {t('you.delete.keep')}
        </Btn>
      </Sheet>
    </View>
  );
}
