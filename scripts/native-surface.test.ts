import { nativeChanges } from './native-surface';

const app = { expo: { version: '3.0', plugins: ['expo-router'] } };
const lock = {
  packages: {
    '': { version: '1.0.0' },
    'node_modules/expo-camera': { version: '56.0.8' },
    'node_modules/zustand': { version: '4.5.0' },
  },
};
const isNative = (p: string) => p.endsWith('/expo-camera') || p.endsWith('/expo-haptics');

describe('nativeChanges', () => {
  it('is empty for a JS-only change, including a JS dependency bump', () => {
    const newLock = { packages: { ...lock.packages, 'node_modules/zustand': { version: '4.6.0' } } };
    expect(
      nativeChanges({ changedPaths: ['src/a.ts', 'package-lock.json'], oldLock: lock, newLock, isNative, oldApp: app, newApp: app }),
    ).toEqual([]);
  });

  it('names a native version change, an added native package, a native dir and an app.json edit', () => {
    const newLock = {
      packages: {
        ...lock.packages,
        'node_modules/expo-camera': { version: '56.0.9' },
        'node_modules/expo-haptics': { version: '56.0.3' },
      },
    };
    const newApp = { expo: { version: '3.0', plugins: ['expo-router', 'expo-haptics'] } };
    expect(
      nativeChanges({
        changedPaths: ['modules/pose-coreml/ios/PoseCoreMLCore.swift', 'app.json'],
        oldLock: lock,
        newLock,
        isNative,
        oldApp: app,
        newApp,
      }),
    ).toEqual([
      'modules/pose-coreml/ios/PoseCoreMLCore.swift changed',
      'app.json changed',
      'expo-camera 56.0.8 -> 56.0.9',
      'expo-haptics 56.0.3 added',
    ]);
  });

  it('ignores a removed native package: the binary still has it and the JS no longer calls it', () => {
    const newLock = { packages: { '': { version: '1.0.0' }, 'node_modules/zustand': { version: '4.5.0' } } };
    expect(nativeChanges({ changedPaths: [], oldLock: lock, newLock, isNative, oldApp: app, newApp: app })).toEqual([]);
  });
});
