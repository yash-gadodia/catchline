import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../design/tokens';

const ARC = 'M64 134 C60 110 62 92 74 78 C86 64 92 50 88 30';

export default function LaunchScreen() {
  return (
    <View
      testID="launch-screen"
      accessibilityLabel="Catchline"
      style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg viewBox="0 0 160 160" width={120} height={120} fill="none">
        <Path d={ARC} stroke="#000" strokeWidth={12} strokeLinecap="round" />
        <Path d={ARC} stroke={colors.flare} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={63} cy={100} r={4.5} fill={colors.text} />
        <Circle cx={74} cy={78} r={4.5} fill={colors.text} />
        <Circle cx={88} cy={30} r={9} fill={colors.flare} stroke="#000" strokeWidth={3} />
      </Svg>
    </View>
  );
}
