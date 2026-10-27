import { Pressable, Text, View } from 'react-native';
import { colors, control, shape, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';

export type TrackKey = 'bar' | 'hips' | 'shoulders' | 'feet';
export type TrackVisibility = Record<TrackKey, boolean>;

export const ALL_TRACKS: TrackVisibility = { bar: true, hips: true, shoulders: true, feet: true };

// One chip per line on the clip; a tap hides or shows it so the lifter stays readable under the tracks.
export default function TrackLegend({ keys, visible, onToggle }: { keys: TrackKey[]; visible: TrackVisibility; onToggle: (k: TrackKey) => void }) {
  return (
    <View testID="track-legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, paddingHorizontal: space.gutter, paddingTop: space.s3 }}>
      {keys.map((k) => {
        const on = visible[k];
        return (
          <Pressable
            key={k}
            testID={`legend-${k}`}
            onPress={() => onToggle(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              height: control.chipHeight,
              paddingHorizontal: space.s3,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s2,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: on ? colors.surface2 : colors.bg,
              ...shape.control,
            }}
          >
            <View style={{ width: 12, height: k === 'bar' ? 3 : 2, backgroundColor: k === 'bar' ? colors.flare : colors.text, opacity: on ? 1 : 0.4 }} />
            <Text style={{ color: on ? colors.text : colors.text3, ...type.readout }}>{t(`analysis.tracks.${k}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
