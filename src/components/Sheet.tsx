import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';

export default function Sheet({
  children,
  gap = 20,
  style,
  testID,
  onLayout,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          borderCurve: 'continuous',
          paddingTop: space.s3,
          paddingHorizontal: space.gutter,
          paddingBottom: space.s7,
          gap,
        },
        style,
      ]}
    >
      <View
        // design-ok: the grabber is the system sheet's 36x4 capsule handle, not a control
        style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center' }}
      />
      {children}
    </View>
  );
}
