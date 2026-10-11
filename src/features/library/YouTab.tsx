import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { Title } from './ui';

// Shell for the You tab: the You screens themselves live under app/you/*.
export default function YouTab({ onOpen, onDev }: { onOpen: () => void; onDev: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter }} testID="you-tab">
      <Title>You</Title>
      <Pressable
        onPress={onOpen}
        testID="open-you"
        style={{ marginTop: space.s5, paddingVertical: space.s4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline, flexDirection: 'row', justifyContent: 'space-between' }}
      >
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 17, lineHeight: 22 }}>Account, plan and settings</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.bodyMedium, fontSize: 17, lineHeight: 22 }}>›</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable onLongPress={onDev} delayLongPress={600} testID="version" style={{ alignSelf: 'center', paddingVertical: space.s4 }}>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
          {`Catchline ${Constants.expoConfig?.version ?? ''}`.trim()}
        </Text>
      </Pressable>
    </View>
  );
}
