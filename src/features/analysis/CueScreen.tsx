import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis } from '../../analysis/types';
import { evidenceReadout, heroValue } from '../../analysis/format';
import ResultNumbers from './ResultNumbers';
import { repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import PathReplay from './PathReplay';
import { t } from '../../i18n';
import { cueText, cueWhy } from '../../i18n/cues';

type Nav = { onTry: () => void; onNotForMe: () => void; onBack: () => void; onFilmAgain: () => void };

// 4.0 gives no cues. This is the sample result the onboarding demo still plays (src/features/onboarding/DemoScreen);
// no route opens it. It goes when the demo does.
export default function CueScreen({ analysis, nav }: { analysis: Analysis; nav: Nav }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cue = analysis.cue;
  if (!cue) return <View style={{ flex: 1, backgroundColor: colors.bg }} testID="cue-screen" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="cue-screen">
      <View style={{ paddingTop: insets.top }}>
        <PathReplay analysis={analysis} rep={repByIndex(analysis, cue.evidence.rep)} box={{ width, height: width }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.s5, paddingHorizontal: space.gutter, gap: space.s3 }}>
        <ResultNumbers analysis={analysis} />
        <SmallCaps>{t('analysis.cue.sampleLabel')}</SmallCaps>
        <Text style={[display(40), { color: colors.text }]} testID="cue-text">
          {cueText(cue.faultId, cue.text)}
        </Text>
        <Text style={{ color: colors.text2, ...type.body }}>{cueWhy(cue.faultId, cue.why)}</Text>
        <View testID="cue-evidence" style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s3 }}>
          <Text testID="hero-number" style={[display(32, true), { color: colors.text }]}>
            {heroValue(cue)}
          </Text>
          <Text testID="evidence-readout" style={{ flex: 1, color: colors.text2, ...type.readout }}>
            {evidenceReadout(cue)}
          </Text>
        </View>
      </ScrollView>
      <View testID="result-actions" style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s2 }}>
        <Btn onPress={nav.onTry} testID="cue-try">
          {t('analysis.cue.try')}
        </Btn>
      </View>
    </View>
  );
}
