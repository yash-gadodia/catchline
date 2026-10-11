import { forwardRef, type ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../design/tokens';

const FADE = 24;

type Props = { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; bg?: string; testID?: string };

// A horizontal chip row that never clips hard: a 24px fade to the background
// on both edges tells the lifter there is more to scroll.
const FadeRow = forwardRef<ScrollView, Props>(function FadeRow({ children, contentContainerStyle, bg = colors.bg, testID }, ref) {
  return (
    <View testID={testID}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={contentContainerStyle}>
        {children}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[bg, `${bg}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FADE }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${bg}00`, bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE }}
      />
    </View>
  );
});

export default FadeRow;
