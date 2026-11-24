import { useEffect, useState } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';
import { usePathname } from 'expo-router';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, shape, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { t } from '../../i18n';
import { SheetTitle } from '../share/ui';
import { answerFeedback, closeFeedback, sendFeedbackNote, useFeedbackAsk } from './ask';

export const FEEDBACK_ROUTE = '/analysis/player';
export const NOTE_MAX = 280;

// The feedback ask, on a lift's result only: no veil, so the lift above stays in view and in reach. One tap answers;
// then one optional line. Leaving the result closes it. Mounted once, over the whole app.
export default function FeedbackSheet() {
  const pathname = usePathname();
  const open = useFeedbackAsk((s) => s.open);
  const answer = useFeedbackAsk((s) => s.answer);
  const [note, setNote] = useState('');
  const keyboard = useKeyboardHeight();
  const here = pathname === FEEDBACK_ROUTE;
  useEffect(() => {
    if (open && !here) closeFeedback(pathname);
  }, [open, here]);
  useEffect(() => {
    if (!open) setNote('');
  }, [open]);
  if (!open || !here) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} testID="feedback-sheet">
      <Sheet gap={space.s4} style={keyboard ? { bottom: keyboard, paddingBottom: space.s4 } : undefined}>
        {answer ? (
          <>
            <SheetTitle>{t(answer === 'up' ? 'you.feedback.more.up' : 'you.feedback.more.down')}</SheetTitle>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              placeholder={t('you.feedback.note')}
              placeholderTextColor={colors.text3}
              returnKeyType="send"
              onSubmitEditing={() => sendFeedbackNote(note)}
              accessibilityLabel={t('you.feedback.note')}
              testID="feedback-note"
              style={{
                height: 52,
                borderWidth: 1,
                borderColor: colors.hairline,
                ...shape.control,
                paddingHorizontal: space.s3,
                color: colors.text,
                fontFamily: fontFamily.body,
                // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
                fontSize: 17,
              }}
            />
            <View style={{ flexDirection: 'row', gap: space.s3 }}>
              <Btn kind="secondary" compact style={{ flex: 1 }} onPress={() => closeFeedback()} testID="feedback-done">
                {t('you.report.done')}
              </Btn>
              <Btn compact style={{ flex: 1 }} disabled={note.trim().length === 0} onPress={() => sendFeedbackNote(note)} testID="feedback-send">
                {t('you.report.send')}
              </Btn>
            </View>
          </>
        ) : (
          <>
            <SheetTitle>{t('you.feedback.title')}</SheetTitle>
            <View style={{ flexDirection: 'row', gap: space.s3 }}>
              <Btn kind="secondary" compact style={{ flex: 1 }} onPress={() => answerFeedback('up')} testID="feedback-up">
                {t('you.feedback.up')}
              </Btn>
              <Btn kind="secondary" compact style={{ flex: 1 }} onPress={() => answerFeedback('down')} testID="feedback-down">
                {t('you.feedback.down')}
              </Btn>
            </View>
            <Btn kind="text" style={{ alignSelf: 'center' }} onPress={() => closeFeedback()} testID="feedback-later">
              {t('notifications.notNow')}
            </Btn>
          </>
        )}
      </Sheet>
    </View>
  );
}

// The sheet sits on the bottom edge, so the keyboard would cover the line while it is typed.
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
