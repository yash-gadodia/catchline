import PoseCoreML from '../../modules/pose-coreml';

// Full on-device analysis (3.1): off unless EXPO_PUBLIC_ON_DEVICE_ANALYSIS=1 at build
// time, and only where the native module exists (iOS). Off = the server path.
export function onDeviceAnalysisEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ON_DEVICE_ANALYSIS === '1' && PoseCoreML !== null;
}
