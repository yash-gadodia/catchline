import { Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space, stroke } from '../design/tokens';

// A list row: content spread across the line, divided from its neighbours by a hairline.
// Padding, height and press feedback stay with the caller, so each list keeps its rhythm.
type Props = Omit<PressableProps, 'style'> & {
  divider?: 'top' | 'bottom' | 'both' | 'none';
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
};

export default function Row({ divider = 'bottom', style, ...rest }: Props) {
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    borderColor: colors.hairline,
    borderTopWidth: divider === 'top' || divider === 'both' ? stroke.hairline : 0,
    borderBottomWidth: divider === 'bottom' || divider === 'both' ? stroke.hairline : 0,
  };
  return <Pressable {...rest} style={(state) => [base, typeof style === 'function' ? style(state) : style]} />;
}
