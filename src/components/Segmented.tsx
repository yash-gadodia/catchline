import { Pressable, Text, View } from 'react-native';
import { colors, shape } from '../design/tokens';
import { fontFamily } from '../design/typography';

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  mono,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  mono?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: colors.hairline,
        ...shape.control,
        overflow: 'hidden',
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={`${testID ?? 'seg'}-${o.value}`}
            style={{
              paddingVertical: mono ? 8 : 6,
              paddingHorizontal: mono ? 10 : 12,
              backgroundColor: on ? colors.text : 'transparent',
            }}
          >
            <Text
              style={{
                color: on ? colors.bg : colors.text,
                fontFamily: mono ? fontFamily.mono : fontFamily.bodyMedium,
                fontSize: mono ? 12 : 13,
                lineHeight: mono ? 16 : 18,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
