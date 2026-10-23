import PoseCoreML from '../../modules/pose-coreml';

// Full on-device analysis (3.1): the only analysis path, wherever the native module
// exists (iOS). Off only where it does not (jest without the mock, Android).
export function onDeviceAnalysisEnabled(): boolean {
  return PoseCoreML !== null;
}
