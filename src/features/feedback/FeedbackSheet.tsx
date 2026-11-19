import { Pressable, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { t } from '../../i18n';
import { Body, SheetTitle } from '../share/ui';
import { FEEDBACK_CONTEXT, closeFeedback, useFeedbackAsk } from './ask';

// The feedback ask, over the first screen only: one button to the report screen, one to close. Mounted once.
export default function FeedbackSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useFeedbackAsk((s) => s.open);
  if (!open || pathname !== '/') return null;
  const give = () => {
    closeFeedback(true);
    router.push({ pathname: '/report', params: { context: FEEDBACK_CONTEXT } } as Href);
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} testID="feedback-sheet">
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={() => closeFeedback(false)} accessibilityLabel={t('you.close')} testID="feedback-dismiss" />
      <Sheet gap={space.s4}>
        <View style={{ gap: space.s1 }}>
          <SheetTitle>{t('you.feedback.title')}</SheetTitle>
          <Body>{t('you.feedback.body')}</Body>
        </View>
        <Btn onPress={give} testID="feedback-give">
          {t('you.shot.give')}
        </Btn>
        <Btn kind="secondary" onPress={() => closeFeedback(false)} testID="feedback-later">
          {t('notifications.notNow')}
        </Btn>
      </Sheet>
    </View>
  );
}
