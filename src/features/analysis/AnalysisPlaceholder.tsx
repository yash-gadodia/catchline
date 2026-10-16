import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { t } from '../../i18n';

const COPY = {
  loading: { title: 'analysis.placeholder.loadingTitle', body: 'analysis.placeholder.loadingBody' },
  missing: { title: 'analysis.placeholder.missingTitle', body: 'analysis.placeholder.missingBody' },
  error: { title: 'analysis.placeholder.errorTitle', body: 'analysis.placeholder.errorBody' },
} as const;

// What a result route shows while its analysis is fetched by lift id, or when
// the server has nothing for that id.
export default function AnalysisPlaceholder({ status, onBack }: { status: keyof typeof COPY; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const copy = COPY[status];
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 56, paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s7) }}
      testID={`analysis-${status}`}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        <Text style={[display(34), { color: colors.text }]}>{t(copy.title)}</Text>
        <Text style={{ color: colors.text2, ...type.callout }}>{t(copy.body)}</Text>
      </View>
      {status === 'loading' ? null : (
        <Btn kind="secondary" onPress={onBack} testID="analysis-back">
          {t('analysis.placeholder.back')}
        </Btn>
      )}
    </View>
  );
}
