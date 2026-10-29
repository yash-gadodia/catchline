import { Image, Pressable, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, shape, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { Body, SheetTitle, Toggle } from '../share/ui';
import { useScreenshotFeedback } from './screenshot';

const THUMB_H = 160;

// The prompt after a screenshot: the capture, one button to the report screen with it attached, and
// the switch that stops the prompt. Mounted once over the whole app; nothing renders without a shot.
export default function ScreenshotSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const shot = useScreenshotFeedback((s) => s.shot);
  const enabled = useScreenshotFeedback((s) => s.enabled);
  const { setEnabled, dismiss } = useScreenshotFeedback.getState();
  if (!shot || pathname === '/report') return null;
  const give = () => {
    dismiss();
    router.push({ pathname: '/report', params: { shot, context: `screenshot ${pathname}` } } as Href);
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} testID="screenshot-sheet">
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={dismiss} accessibilityLabel={t('you.close')} testID="screenshot-dismiss" />
      <Sheet gap={space.s4}>
        <View style={{ alignItems: 'center' }}>
          <Image
            source={{ uri: shot }}
            resizeMode="contain"
            testID="screenshot-thumb"
            style={{ height: THUMB_H, aspectRatio: 9 / 19.5, borderWidth: 1, borderColor: colors.hairline, ...shape.control }}
          />
        </View>
        <View style={{ gap: space.s1 }}>
          <SheetTitle>{t('you.shot.title')}</SheetTitle>
          <Body>{t('you.shot.body')}</Body>
        </View>
        <Btn onPress={give} testID="screenshot-give">
          {t('you.shot.give')}
        </Btn>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3 }}>
          <View style={{ flex: 1, gap: space.s1 }}>
            <Text style={{ color: colors.text, ...type.body }}>{t('you.shot.toggle')}</Text>
            <Text style={{ color: colors.text2, ...type.small }}>{t('you.shot.toggleSub')}</Text>
          </View>
          <Toggle
            value={enabled}
            onChange={(v) => {
              setEnabled(v);
              if (!v) dismiss();
            }}
            testID="screenshot-toggle"
          />
        </View>
      </Sheet>
    </View>
  );
}
