import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../src/components/SmallCaps';
import { colors, space } from '../../src/design/tokens';
import { display, fontFamily } from '../../src/design/typography';
import FromCoachCard, { ReplacedCueRow } from '../../src/features/share/FromCoachCard';
import { useCoachOverride } from '../../src/features/share/coachRepository';
import { t } from '../../src/i18n';

export default function FromCoachRoute() {
  const { fixture } = useLocalSearchParams<{ fixture?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const override = useCoachOverride(fixture ?? 'snatch-mock');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s7, paddingHorizontal: space.gutter, gap: space.s5 }}
    >
      <Text style={[display(36), { color: colors.text }]}>{t('share.fromCoach.cues')}</Text>
      {override ? (
        <>
          <FromCoachCard override={override} onTry={back} />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <SmallCaps size={12} style={{ paddingTop: space.s4, paddingBottom: space.s1 }}>
              {t('share.fromCoach.past')}
            </SmallCaps>
            <ReplacedCueRow override={override} sessions={3} />
          </View>
        </>
      ) : (
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          {t('share.fromCoach.none')}
        </Text>
      )}
    </ScrollView>
  );
}
