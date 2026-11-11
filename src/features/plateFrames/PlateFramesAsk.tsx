import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { Body, SheetTitle } from '../share/ui';
import { t } from '../../i18n';
import { setPlateFramesChoice, shouldAskPlateFrames } from './consent';
import { sendLiftFrames } from './send';

// Asked once, over the lifter's first tracked lift (never in onboarding): off unless they say yes here or later in
// the You tab. A yes also sends this lift's frames.
export const ASK_DELAY_MS = 2500;

export default function PlateFramesAsk({ liftId }: { liftId: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!shouldAskPlateFrames()) return;
    const timer = setTimeout(() => setOpen(shouldAskPlateFrames()), ASK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!open) return null;
  const answer = (granted: boolean) => {
    setOpen(false);
    void setPlateFramesChoice(granted).then(() => (granted ? sendLiftFrames(liftId) : 0));
  };
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} testID="plates-ask">
      <Pressable onPress={() => answer(false)} style={{ flex: 1, backgroundColor: colors.scrim }} accessibilityRole="button" accessibilityLabel={t('you.plates.no')} testID="plates-ask-scrim" />
      <Sheet gap={space.s4}>
        <SheetTitle>{t('you.plates.title')}</SheetTitle>
        <Body color={colors.text} testID="plates-ask-body">{t('you.plates.body')}</Body>
        <Body testID="plates-ask-detail">{t('you.plates.detail')}</Body>
        <View style={{ gap: space.s3 }}>
          <Btn onPress={() => answer(true)} testID="plates-ask-yes">
            {t('you.plates.yes')}
          </Btn>
          <Btn kind="secondary" compact onPress={() => answer(false)} testID="plates-ask-no">
            {t('you.plates.no')}
          </Btn>
        </View>
      </Sheet>
    </View>
  );
}
