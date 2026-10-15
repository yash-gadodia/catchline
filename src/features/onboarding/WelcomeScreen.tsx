import { Image, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { display } from '../../design/typography';

const HERO = require('../../../assets/art/welcome-hero.png');

export default function WelcomeScreen({
  onStart,
  onImport,
  onSample,
}: {
  onStart: () => void;
  onImport: () => void;
  onSample?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: Math.max(height - 260, width) };

  return (
    <View testID="welcome-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, overflow: 'hidden' }}>
        <Image
          testID="welcome-hero"
          source={HERO}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top: insets.top, width: box.width, height: box.height - insets.top }}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', colors.bg]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 }}
          pointerEvents="none"
        />
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s6, gap: space.s5 }}>
        <Text style={[display(44), { color: colors.text }]}>{'Film a lift.\nGet the one thing to fix.'}</Text>
        <Btn onPress={onStart} testID="welcome-start">
          Start
        </Btn>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s6 }}>
          <Btn kind="text" onPress={onImport} testID="welcome-import">
            Import a clip
          </Btn>
          {onSample ? (
            <Btn kind="text" onPress={onSample} testID="welcome-sample">
              Try a sample lift
            </Btn>
          ) : null}
        </View>
      </View>
    </View>
  );
}
