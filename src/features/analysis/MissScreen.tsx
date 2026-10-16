import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Analysis } from '../../analysis/types';
import { liftTitle } from '../../analysis/format';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import EvidenceStage from './EvidenceStage';
import { t } from '../../i18n';
import { cueText, cueWhy } from '../../i18n/cues';

export default function MissScreen({
  analysis,
  onBack,
  onCompare,
}: {
  analysis: Analysis;
  onBack: () => void;
  onCompare?: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cue = analysis.cue;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="miss-screen">
      <TopBar title={liftTitle(analysis, 'miss')} onBack={onBack} />
      {cue ? (
        <>
          <EvidenceStage
            analysis={analysis}
            cue={cue}
            box={{ width, height: Math.round(width * (440 / 390)) }}
            zoom={1}
            showPath
            heroSize={44}
            readoutTop
          />
          <View style={{ flex: 1, paddingTop: space.s5, paddingHorizontal: space.gutter, gap: 10 }}>
            <SmallCaps>{t('analysis.miss.because')}</SmallCaps>
            <Text style={[display(36), { color: colors.text }]}>{cueText(cue.faultId, cue.text)}</Text>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
              {cueWhy(cue.faultId, cue.why)}
            </Text>
          </View>
          {onCompare ? (
            <View style={{ paddingTop: space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s7 }}>
              <Btn onPress={onCompare} testID="miss-compare">
                {t('analysis.miss.compare')}
              </Btn>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
