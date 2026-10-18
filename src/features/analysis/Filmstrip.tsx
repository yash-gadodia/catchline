import { useEffect, useRef } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { PhaseName, Rep } from '../../analysis/types';
import { phaseLabel, seconds } from '../../analysis/format';
import { frameSource } from '../../analysis/frames';
import { keyFrameForPhase, phaseFrame } from '../../analysis/timeline';
import { colors, opacity, shape, space, stroke } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { t, type Key } from '../../i18n';

const THUMB = { width: 72, height: 96 };
const MARK = 10;

// Short enough that every phase name fits under its thumbnail.
const SHORT: Partial<Record<PhaseName, Key>> = { transition: 'analysis.chip.transition', turnover: 'analysis.chip.turnover', recovery: 'analysis.chip.recovery' };

export function chipLabel(p: PhaseName): string {
  const key = SHORT[p];
  return key ? t(key) : phaseLabel(p);
}

export type PhaseMark = 'cue' | 'follows';

export default function Filmstrip({
  rep,
  fps,
  active,
  marks,
  onPick,
}: {
  rep: Rep;
  fps: number;
  active: PhaseName | null;
  marks: Partial<Record<PhaseName, PhaseMark>>;
  onPick: (name: PhaseName) => void;
}) {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const index = rep.phases.findIndex((p) => p.name === active);
  useEffect(() => {
    if (index < 0) return;
    const x = space.gutter + index * (THUMB.width + space.s2) - (width - THUMB.width) / 2;
    scroll.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [index, width]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="filmstrip"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: space.s2 }}
    >
      {rep.phases.map((p, i) => {
        const on = p.name === active;
        const image = frameSource(keyFrameForPhase(rep, p.name)?.image);
        const mark = marks[p.name];
        const at = seconds((phaseFrame(rep, p.name) - rep.startFrame) / fps);
        return (
          <Pressable
            key={p.name}
            testID={`frame-${p.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${phaseLabel(p.name)}, ${at} s`}
            onPress={() => onPick(p.name)}
            style={{ width: THUMB.width }}
          >
            <View
              style={{
                ...THUMB,
                ...shape.control,
                overflow: 'hidden',
                backgroundColor: colors.surface,
                borderWidth: on ? stroke.outline : stroke.hairline,
                borderColor: on ? colors.text : colors.hairline,
              }}
            >
              {image ? (
                <Image source={image} resizeMode="cover" style={{ width: '100%', height: '100%', opacity: on ? 1 : opacity.lines }} />
              ) : null}
              <Text
                style={{ ...type.caption, color: colors.text, position: 'absolute', top: space.s1, left: space.s1, textShadowColor: colors.halo, textShadowRadius: 3 }}
              >
                {String(i + 1)}
              </Text>
              {mark ? (
                <View
                  testID={`frame-mark-${mark}`}
                  style={{
                    position: 'absolute',
                    top: space.s1,
                    right: space.s1,
                    width: MARK,
                    height: MARK,
                    borderRadius: MARK / 2,
                    backgroundColor: mark === 'cue' ? colors.flare : colors.halo,
                    borderWidth: stroke.outline,
                    borderColor: mark === 'cue' ? colors.halo : colors.flare,
                  }}
                />
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ ...display(19), color: on ? colors.text : colors.text2, textTransform: 'uppercase', marginTop: space.s1 }}>
              {chipLabel(p.name)}
            </Text>
            <Text style={{ ...type.caption, color: colors.text3 }}>{`${at} s`}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
