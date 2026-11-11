import type { ComponentType, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export type LiftCameraRef = {
  // The recording's file uri, or null if nothing was recorded. Ends on stop() or at maxDurationS.
  record: (maxDurationS: number) => Promise<string | null>;
  stop: () => Promise<void>;
};

type Props = { ref?: Ref<LiftCameraRef>; active: boolean; style?: StyleProp<ViewStyle>; testID?: string };

// iOS only (4.0.0 binaries on): null elsewhere, and the caller falls back to expo-camera.
const Native = requireOptionalNativeModule<{ recordFps: number }>('LiftCamera');

export const recordFps: number | null = Native ? Native.recordFps : null;
export const LiftCameraView: ComponentType<Props> | null = Native ? requireNativeView<Props>('LiftCamera') : null;
