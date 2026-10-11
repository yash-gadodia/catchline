import type { ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Point } from '../../analysis/types';
import { coverFit, type Fit, type Size } from '../../analysis/geometry';
import { frameSource } from '../../analysis/frames';
import { colors } from '../../design/tokens';

export type StageLayer = { image?: string; gray?: boolean; opacity?: number; blend?: boolean; key?: string };

type Props = {
  src: Size;
  box: Size;
  layers: StageLayer[];
  focus?: Point;
  zoom?: number;
  zoomOrigin?: Point;
  children?: (fit: Fit) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// The video stage: radius 0, cover-fitted frames. Overlays receive the same Fit
// as the image so normalised trace points land on the pixels they describe.
// A real expo-video surface can replace the image layers without touching this contract.
export default function Stage({ src, box, layers, focus, zoom, zoomOrigin, children, style, testID }: Props) {
  const fit = coverFit(src, box, focus, zoom, zoomOrigin);
  return (
    <View
      testID={testID}
      style={[{ width: box.width, height: box.height, overflow: 'hidden', backgroundColor: colors.surface }, style]}
    >
      {layers.map((l, i) => {
        const source = frameSource(l.image, l.gray);
        if (!source) return null;
        const image = (
          <Image
            source={source}
            testID={`stage-layer-${l.image}`}
            style={{
              position: 'absolute',
              left: fit.x,
              top: fit.y,
              width: fit.width,
              height: fit.height,
              opacity: l.opacity ?? 1,
            }}
          />
        );
        const key = l.key ?? `${l.image}-${i}`;
        if (!l.blend) return <View key={key} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>{image}</View>;
        return (
          <View key={key} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, mixBlendMode: 'lighten' }}>
            {image}
          </View>
        );
      })}
      {children?.(fit)}
    </View>
  );
}
