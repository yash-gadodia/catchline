import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shape } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { t } from '../../i18n';

export type TabName = 'index' | 'cues' | 'trends' | 'me';

const LEFT: { name: TabName; label: () => string }[] = [
  { name: 'index', label: () => t('library.tabs.lifts') },
  { name: 'cues', label: () => t('library.tabs.cues') },
];
const RIGHT: { name: TabName; label: () => string }[] = [
  { name: 'trends', label: () => t('library.tabs.trends') },
  { name: 'me', label: () => t('library.tabs.you') },
];

export default function TabBar({
  active,
  onTab,
  onImport,
}: {
  active: TabName;
  onTab: (name: TabName) => void;
  onImport: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tab = (t: { name: TabName; label: () => string }) => {
    const on = t.name === active;
    return (
      <Pressable
        key={t.name}
        onPress={() => onTab(t.name)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        testID={`tab-${t.name}`}
        style={{ flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: on ? colors.text : colors.text2, ...type.caption, fontFamily: fontFamily.bodyMedium }}>
          {t.label()}
        </Text>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        backgroundColor: colors.bg,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 8,
      }}
    >
      {LEFT.map(tab)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          onPress={onImport}
          accessibilityRole="button"
          accessibilityLabel={t('library.lifts.import')}
          testID="tab-import"
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            ...shape.control,
            backgroundColor: colors.flare,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 22, height: 3, backgroundColor: colors.onFlare }} />
            <View style={{ position: 'absolute', width: 3, height: 22, backgroundColor: colors.onFlare }} />
          </View>
        </Pressable>
      </View>
      {RIGHT.map(tab)}
    </View>
  );
}
