import Constants from 'expo-constants';
import type Purchases from 'react-native-purchases';
import type RevenueCatUI from 'react-native-purchases-ui';

// react-native-purchases is a NATIVE module - it is absent in Expo Go. We guard
// the require() so the app still runs in Expo Go (demo mode); a dev/EAS build
// gets the real SDK. Type-only imports above are erased at compile time, so they
// never trigger native access.
export const isExpoGo = Constants.executionEnvironment === 'storeClient';

// RevenueCat PUBLIC SDK keys are safe to ship in the client.
export const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

let loaded = false;
let _Purchases: typeof Purchases | null = null;
let _RevenueCatUI: typeof RevenueCatUI | null = null;

export function loadPurchases(): {
  Purchases: typeof Purchases | null;
  RevenueCatUI: typeof RevenueCatUI | null;
} {
  if (loaded) return { Purchases: _Purchases, RevenueCatUI: _RevenueCatUI };
  loaded = true;
  if (isExpoGo) return { Purchases: null, RevenueCatUI: null };
  try {
    _Purchases = require('react-native-purchases').default;
    _RevenueCatUI = require('react-native-purchases-ui').default;
  } catch {
    _Purchases = null;
    _RevenueCatUI = null;
  }
  return { Purchases: _Purchases, RevenueCatUI: _RevenueCatUI };
}

// True when the real RevenueCat SDK is available (dev/EAS build with a key).
export function purchasesAvailable(): boolean {
  const key = RC_IOS_KEY || RC_ANDROID_KEY;
  return !!loadPurchases().Purchases && !!key;
}
