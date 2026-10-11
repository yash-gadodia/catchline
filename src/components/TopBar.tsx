import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, space } from '../design/tokens';
import { fontFamily } from '../design/typography';

export default function TopBar({
  back = 'Lifts',
  onBack,
  title,
  center,
  more = true,
}: {
  back?: string;
  onBack?: () => void;
  title?: string;
  center?: ReactNode;
  more?: boolean;
}) {
  return (
    <View
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.gutter,
      }}
    >
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" testID="topbar-back">
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>
          ‹ {back}
        </Text>
      </Pressable>
      {center ??
        (title ? (
          <Text
            numberOfLines={1}
            style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}
          >
            {title}
          </Text>
        ) : null)}
      <Text
        style={{
          color: more ? colors.text : 'transparent',
          fontFamily: fontFamily.bodyBold,
          fontSize: 17,
          lineHeight: 22,
          letterSpacing: 1,
        }}
      >
        ···
      </Text>
    </View>
  );
}
