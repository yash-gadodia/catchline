import { useImperativeHandle, useRef, type Ref } from 'react';
import { Linking, type StyleProp, type ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraStatus } from '../../onboarding/flow';

// The camera seam. Everything Catchline needs from a camera lives behind this
// file, so moving to react-native-vision-camera (60/240 fps formats and frame
// processors for on-device pose) only touches here.
//
// expo-camera (SDK 56) has no frame-rate control: it records at the device
// default, 30 fps on iPhone. The badge reports that honestly.
export const RECORD_FPS = 30;

export type CameraHandle = {
  record: (maxDurationS: number) => Promise<string | null>;
  stop: () => void;
};

export function CameraSurface({
  ref,
  active,
  style,
}: {
  ref?: Ref<CameraHandle>;
  active: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const camera = useRef<CameraView>(null);
  useImperativeHandle(ref, () => ({
    record: async (maxDurationS) => {
      const result = await camera.current?.recordAsync({ maxDuration: maxDurationS });
      return result?.uri ?? null;
    },
    stop: () => camera.current?.stopRecording(),
  }));
  return <CameraView ref={camera} style={style} facing="back" mode="video" mute active={active} testID="camera-surface" />;
}

export type CameraPermission = {
  ready: boolean;
  status: CameraStatus;
  canAskAgain: boolean;
  request: () => Promise<CameraStatus>;
  openSettings: () => void;
};

export function useCameraPermission(): CameraPermission {
  const [permission, request] = useCameraPermissions();
  const status: CameraStatus = permission?.granted
    ? 'granted'
    : permission && permission.status === 'denied'
      ? 'denied'
      : 'undetermined';
  return {
    ready: permission != null,
    status,
    canAskAgain: permission?.canAskAgain ?? true,
    request: async () => {
      const next = await request();
      return next.granted ? 'granted' : next.status === 'denied' ? 'denied' : 'undetermined';
    },
    openSettings: () => {
      Linking.openSettings();
    },
  };
}
