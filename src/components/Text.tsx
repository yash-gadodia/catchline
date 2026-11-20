import { Text as NativeText, type TextProps } from 'react-native';
import { textScale } from '../design/tokens';

// The app's one Text. Dynamic Type grows it up to textScale.max; past that (iOS's accessibility sizes reach about
// 3x) rows, chips, the tab bar and the paywall card clipped into slivers or ran into each other. A caller can still
// pass its own maxFontSizeMultiplier.
export default function Text(props: TextProps) {
  return <NativeText maxFontSizeMultiplier={textScale.max} {...props} />;
}
