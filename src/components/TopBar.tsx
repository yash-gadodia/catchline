import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, space } from '../design/tokens';
import { fontFamily } from '../design/typography';
import { t } from '../i18n';

export const TOP_BAR_H = 56;

export default function TopBar({
  back = t('library.tabs.lifts'),
  onBack,
  title,
  center,
  more = true,
  onMore,
}: {
  back?: string;
  onBack?: () => void;
  title?: string;
  center?: ReactNode;
  more?: boolean;
  onMore?: () => void;
}) {
  return (
    <View
      style={{
        minHeight: TOP_BAR_H,
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
      {/* the middle takes what the back label and the dots leave, so a long title wraps or truncates instead of running into them */}
      <View style={{ flex: 1, alignItems: 'center', marginHorizontal: space.s3 }} testID="topbar-center">
        {center ??
          (title ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}
            >
              {title}
            </Text>
          ) : null)}
      </View>
      <Pressable
        onPress={onMore}
        disabled={!more || !onMore}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="More"
        accessibilityElementsHidden={!more || !onMore}
        testID="topbar-more"
      >
        <Text
          style={{
            color: more && onMore ? colors.text : 'transparent',
            fontFamily: fontFamily.bodyBold,
            fontSize: 17,
            lineHeight: 22,
            letterSpacing: 1,
          }}
        >
          ···
        </Text>
      </Pressable>
    </View>
  );
}
