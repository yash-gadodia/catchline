import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { FREE_VIDEOS } from './entitlements';
import { Backdrop, Body, SheetTitle, useSheetTop } from './ui';

// Before the third free analysis (Otter/Fuse pattern): warn at the point of
// use and still let the action through.
export default function LastFreeSheet({ onContinue, onPlans }: { onContinue: () => void; onPlans: () => void }) {
  const total = FREE_VIDEOS.organic;
  const sheet = useSheetTop();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="last-free">
      <Backdrop art="power" sheetTop={sheet.top} />
      <Sheet gap={space.s4} onLayout={sheet.onLayout} testID="paywall-sheet">
        <SheetTitle size={34}>This is your last free video</SheetTitle>
        <Body>After this one, analysis needs a plan. Filming stays free, and everything you have analysed stays yours.</Body>
        <Btn onPress={onContinue} testID="last-free-continue">
          Film it
        </Btn>
        <Btn kind="secondary" onPress={onPlans} testID="last-free-plans">
          See plans
        </Btn>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
          {`video ${total} of ${total} free`}
        </Text>
      </Sheet>
    </View>
  );
}
