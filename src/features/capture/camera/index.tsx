import { useImperativeHandle, useRef, type Ref } from 'react';
import { Linking, type StyleProp, type ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraStatus } from '../../onboarding/flow';
import { LiftCameraView, recordFps, type LiftCameraRef } from '../../../../modules/lift-camera';

// The camera seam. Everything Catchline needs from a camera lives behind this file.
//
// iOS films through modules/lift-camera: 1080p at 60 fps where the back camera has such a format, else 30
// (RECORD_FPS says which on this phone). expo-camera has no frame-rate control; it stays for the permission
// and for platforms without the module, at its 30 fps default.
export const RECORD_FPS = recordFps ?? 30;

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
  const lift = useRef<LiftCameraRef>(null);
  useImperativeHandle(ref, () => ({
    record: async (maxDurationS) => {
      if (LiftCameraView) return (await lift.current?.record(maxDurationS)) ?? null;
      const result = await camera.current?.recordAsync({ maxDuration: maxDurationS });
      return result?.uri ?? null;
    },
    stop: () => {
      if (LiftCameraView) void lift.current?.stop();
      else camera.current?.stopRecording();
    },
  }));
  if (LiftCameraView) return <LiftCameraView ref={lift} style={style} active={active} testID="camera-surface" />;
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
