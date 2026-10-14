import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';

const COPY = {
  loading: { title: 'Loading your lift', body: 'One moment.' },
  missing: { title: "Couldn't find this lift.", body: 'It may still be analysing, or it was removed.' },
  error: { title: "Couldn't load this lift.", body: 'Check your connection and try again.' },
};

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
        <Text style={[display(34), { color: colors.text }]}>{copy.title}</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>{copy.body}</Text>
      </View>
      {status === 'loading' ? null : (
        <Btn kind="secondary" onPress={onBack} testID="analysis-back">
          Back
        </Btn>
      )}
    </View>
  );
}
