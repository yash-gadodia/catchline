import { useEffect, type ReactNode } from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { frameSource } from '../../analysis/frames';
import { coverFit } from '../../analysis/geometry';
import type { Point } from '../../analysis/types';
import Btn from '../../components/Btn';
import { colors } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';

const LIBRARY: Record<string, { color: ImageSourcePropType; gray?: ImageSourcePropType }> = {
  'mu-3-hip-drive': {
    color: require('../../../assets/library/mu-3-hip-drive.jpg'),
    gray: require('../../../assets/library/gray/mu-3-hip-drive.jpg'),
  },
  'mu-5-support': {
    color: require('../../../assets/library/mu-5-support.jpg'),
    gray: require('../../../assets/library/gray/mu-5-support.jpg'),
  },
  'hs-2': { color: require('../../../assets/library/hs-2.jpg') },
};

// `library:` ids are frames bundled for this feature; everything else goes
// through the analysis frame registry.
export function imageSource(id: string | undefined, gray = false): ImageSourcePropType | null {
  if (!id) return null;
  if (id.startsWith('library:')) {
    const entry = LIBRARY[id.slice('library:'.length)];
    if (!entry) return null;
    return gray ? (entry.gray ?? entry.color) : entry.color;
  }
  return frameSource(id, gray);
}

const SRC = { width: 608, height: 1080 };

export function Frame({
  image,
  width,
  height,
  gray,
  opacity = 1,
  focus = { x: 0.5, y: 0.45 },
  zoom = 1,
  children,
  testID,
}: {
  image?: string;
  width: number;
  height: number;
  gray?: boolean;
  opacity?: number;
  focus?: Point;
  zoom?: number;
  children?: ReactNode;
  testID?: string;
}) {
  const box = { width, height };
  const fit = coverFit(SRC, box, focus, zoom, focus);
  const source = imageSource(image, gray);
  return (
    <View testID={testID} style={{ width, height, overflow: 'hidden', backgroundColor: colors.surface }}>
      {source ? (
        <Image
          source={source}
          style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.width, height: fit.height, opacity }}
        />
      ) : null}
      {children}
    </View>
  );
}

export function Pulse({ children }: { children: ReactNode }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(0.35, { duration: 800 }), withTiming(1, { duration: 800 })), -1);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// Destructive action: flare outline, never a filled flare button.
export function DestructiveBtn({
  children,
  onPress,
  testID,
  style,
}: {
  children: string;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Btn kind="destructive" onPress={onPress} testID={testID} style={style}>
      {children}
    </Btn>
  );
}

export function Underlined({ children, onPress, color = colors.text, testID }: { children: string; onPress?: () => void; color?: string; testID?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" testID={testID}>
      <Text style={{ color, ...type.callout, fontFamily: fontFamily.bodyMedium, textDecorationLine: 'underline' }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Title({ children }: { children: string }) {
  return (
    <Text style={[display(36), { color: colors.text }]}>
      {children}
    </Text>
  );
}
