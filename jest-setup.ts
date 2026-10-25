import '@testing-library/react-native/matchers';

// jest-expo's preset lazily requires the native ExpoModulesCoreJSLogger module
// (absent in jest) and warns about it asynchronously. On CI that warning can land
// AFTER a test finishes, which jest treats as a fatal "Cannot log after tests are
// done" (exit 1) even though every assertion passed. Filter only this known-benign
// message so it never reaches jest's console guard. (Everything else still logs.)
const __origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('ExpoModulesCoreJSLogger')) {
    return;
  }
  __origWarn(...args);
};

// Default Supabase env so src/lib/supabase.ts constructs in tests (no real network is hit
// in render-smoke tests). The env-missing-throw test deletes these itself.
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

// AsyncStorage's native module isn't available in jest — use its official mock
// (supabase.ts imports it for auth persistence).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock the Supabase client so screen render-smoke tests don't hit the network
// (clean empty results -> pristine output). Tests that need specific behavior
// mock '../lib/supabase' locally and override this.
jest.mock('@supabase/supabase-js', () => {
  const makeQuery = () => {
    const q: any = {};
    const chain = [
      'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'or',
      'in', 'is', 'order', 'limit', 'range', 'filter', 'match', 'gte', 'lte',
    ];
    chain.forEach((m) => { q[m] = () => q; });
    q.single = () => Promise.resolve({ data: null, error: null });
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (resolve: (v: { data: never[]; error: null }) => unknown) =>
      resolve({ data: [], error: null });
    return q;
  };
  const channel = () => {
    const c: any = {};
    c.on = () => c;
    c.subscribe = () => c;
    c.unsubscribe = () => {};
    return c;
  };
  return {
    createClient: () => ({
      from: () => makeQuery(),
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
      channel,
      removeChannel: () => {},
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.resolve({ data: { session: null }, error: null }),
        signUp: () => Promise.resolve({ data: { session: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        signInWithIdToken: () => Promise.resolve({ data: { session: null }, error: null }),
      },
    }),
  };
});

// Mock reanimated to avoid native module initialization
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const Animated = require('react-native').Animated;

  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: any) => component,
    },
    Animated: {
      ...Animated,
      View,
      createAnimatedComponent: (component: any) => component,
    },
    useSharedValue: (init: any) => {
      const value = { value: init };
      return new Proxy(value, {
        get(target: any, prop: any) {
          if (prop === 'value') return target.value;
          if (prop === 'get') return () => target.value;
          if (prop === 'set') return (newValue: any) => {
            target.value = typeof newValue === 'function' ? newValue(target.value) : newValue;
          };
        },
        set(target: any, prop: any, newValue: any) {
          if (prop === 'value') target.value = newValue;
          return true;
        },
      });
    },
    useAnimatedStyle: (callback: any) => callback(),
    useAnimatedProps: (callback: any) => callback(),
    useAnimatedReaction: () => {},
    useAnimatedRef: () => ({ current: null }),
    useAnimatedScrollHandler: () => {},
    useDerivedValue: (callback: any) => ({ value: callback(), get: () => callback() }),
    useAnimatedSensor: () => ({ sensor: { value: { x: 0, y: 0, z: 0 } } }),
    useReducedMotion: () => false,
    withTiming: (target: any, config?: any) => target,
    withSpring: (target: any, config?: any) => target,
    withDecay: (config: any) => 0,
    withRepeat: (anim: any) => anim,
    withSequence: (...anims: any[]) => anims[anims.length - 1],
    withDelay: (_delay: any, anim: any) => anim,
    Easing: {
      linear: () => 0,
      ease: () => 0,
      quad: () => 0,
      cubic: () => 0,
      bezier: () => () => 0,
      in: (fn: any) => fn,
      out: (fn: any) => fn,
      inOut: (fn: any) => fn,
    },
    cancelAnimation: () => {},
    getAnimatedStyle: () => ({}),
    setUpTests: () => {},
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    SafeAreaInsetsContext: { Provider: ({ children }: any) => children },
    SafeAreaFrameContext: { Provider: ({ children }: any) => children },
  };
});

// Mock expo-router (avoids its ESM-only deps in jest + gives screens a router)
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children }: any) => children ?? null;
  const Stack: any = passthrough;
  Stack.Screen = () => null;
  const Tabs: any = passthrough;
  Tabs.Screen = () => null;
  const navigation = { setOptions: jest.fn(), getParent: () => undefined };
  return {
    useNavigation: () => navigation,
    __esModule: true,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismiss: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    usePathname: () => '/',
    useSegments: () => [],
    useFocusEffect: () => {},
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    Link: ({ children }: any) => React.createElement(View, null, children),
    Redirect: () => null,
    Stack,
    Tabs,
    Slot: passthrough,
  };
});

// Social-auth native modules — absent in jest.
jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  signInAsync: jest.fn(() =>
    Promise.resolve({ identityToken: 'apple-id-token', fullName: null, email: null })
  ),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return React.createElement(Pressable, { onPress, testID, accessibilityRole: 'button' },
      React.createElement(Text, null, 'Continue with Apple'));
  },
}));
// expo-crypto is native — back it with node's crypto so nonce tests assert real digests.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    __esModule: true,
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: (_alg: string, s: string) =>
      Promise.resolve(nodeCrypto.createHash('sha256').update(s).digest('hex')),
  };
});
// expo-secure-store is the Keychain: an in-memory map (reset it with __reset in a test).
jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    __esModule: true,
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn(async (k: string) => items.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      items.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      items.delete(k);
    }),
    __reset: () => items.clear(),
  };
});
jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(() =>
    Promise.resolve({ type: 'success', url: 'catchline://auth-callback?code=test-code' })
  ),
  maybeCompleteAuthSession: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  __esModule: true,
  createURL: (path: string) => `catchline://${path}`,
  parse: (url: string) => {
    const q: Record<string, string> = {};
    const query = url.split('?')[1];
    if (query) query.split('&').forEach((p) => { const [k, v] = p.split('='); q[k] = v; });
    return { queryParams: q };
  },
}));

// RevenueCat native modules — absent in jest. The app guards their require() at
// runtime, but mock them so any code path that loads them stays inert in tests.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    addCustomerInfoUpdateListener: jest.fn(),
    purchasePackage: jest.fn(() => Promise.resolve({ customerInfo: { entitlements: { active: {} } } })),
    restorePurchases: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
  },
}));
jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: {
    presentPaywall: jest.fn(() => Promise.resolve('NOT_PRESENTED')),
    presentPaywallIfNeeded: jest.fn(() => Promise.resolve('NOT_PRESENTED')),
    presentCustomerCenter: jest.fn(() => Promise.resolve()),
  },
}));

// expo-haptics is native — stub it so src/lib/haptics is a clean no-op in jest.
jest.mock('expo-haptics', () => ({
  __esModule: true,
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// expo-image-picker is native — the library picker resolves cancelled unless a
// test overrides it.
jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));

// expo-clipboard is native — stub it for the share sheet's Copy action.
jest.mock('expo-clipboard', () => ({
  __esModule: true,
  setStringAsync: jest.fn(() => Promise.resolve()),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));

// react-native-view-shot is native — captureRef resolves a stable fake file uri
// so the share card's image-capture path tests cleanly. Tests override with
// mockRejectedValueOnce to exercise the text-share fallback.
jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  captureRef: jest.fn(() => Promise.resolve('file:///mock/share-card.png')),
}));

// expo-blur's BlurView is native — render it as a plain View in jest so screens
// that frost content (reveal, checkout, packDetail, wrapped, homeScreen, Sheet) test cleanly.
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    BlurView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

// expo-notifications is native — stub so screens and notification tests run in jest.
// Individual test files that need specific behavior override with jest.mock locally.
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', granted: true, canAskAgain: false, expires: 'never' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('catchline-nudge')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test-token]', type: 'expo' })),
  getDevicePushTokenAsync: jest.fn(() => Promise.resolve({ data: 'a1b2c3', type: 'ios' })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationHandler: jest.fn(),
}));

// expo-video: a View for the surface and a player that records play/pause.
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: jest.fn((_source: unknown, setup?: (p: object) => void) => {
      const player = { play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) };
      setup?.(player);
      return player;
    }),
  };
});

// The clip transcoder is a local native module (modules/clip-transcoder): a 12 s
// 4K 30 fps source comes back as a 12 MB 1080p copy unless a test overrides it.
jest.mock('./modules/clip-transcoder', () => ({
  __esModule: true,
  default: {
    probe: jest.fn(async () => ({ width: 3840, height: 2160, fps: 30, durationS: 12 })),
    transcode: jest.fn(async (o: { width: number; height: number; fps: number; startS: number; endS: number }) => ({
      uri: 'file:///cache/clip-transcoder/out.mp4',
      size: 12_000_000,
      width: o.width,
      height: o.height,
      fps: o.fps,
      frames: Math.round((o.endS - o.startS) * o.fps),
      durationS: o.endS - o.startS,
    })),
    renderShareVideo: jest.fn(async (_uri: string, spec: { width: number; height: number; durationS: number }) => ({
      uri: 'file:///cache/share-video/catchline.mp4',
      width: spec.width,
      height: spec.height,
      durationS: spec.durationS,
    })),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

// On-device pose (modules/pose-coreml): one frame with one person (head points
// null, as the phone drops them) and one empty frame; addListener hands each
// subscriber 0.5 then 1 as analyzePose runs.
jest.mock('./modules/pose-coreml', () => {
  const listeners: ((e: { progress: number }) => void)[] = [];
  const analyseListeners: ((e: { stage: string; fraction: number }) => void)[] = [];
  return {
    __esModule: true,
    default: {
      // Full on-device analysis (3.1): one pass, a gzipped trace file and no stills unless a test overrides it.
      analyseOnDevice: jest.fn(async () => {
        analyseListeners.forEach((l) => l({ stage: 'pose', fraction: 0.5 }));
        analyseListeners.forEach((l) => l({ stage: 'camera', fraction: 1 }));
        return { tracePath: 'file:///cache/pose-coreml/trace.json.gz', stills: {} };
      }),
      analyzePose: jest.fn(async () => {
        listeners.forEach((l) => l({ progress: 0.5 }));
        listeners.forEach((l) => l({ progress: 1 }));
        const kp = [null, null, null, null, null, [310.5, 402.1, 0.912], ...Array(20).fill([300, 500, 0.5])];
        return {
          fps: 30,
          width: 720,
          height: 1280,
          frames: [
            { t: 0, people: [{ box: [250.2, 180, 470.8, 1210.4], kp }], lifter: 0 },
            { t: 0.0333, people: [] },
          ],
        };
      }),
      ensureModels: jest.fn(async () => ({ status: 'ready', fraction: 1 })),
      modelsStatus: jest.fn(async () => ({ status: 'ready', fraction: 1 })),
      addListener: jest.fn((e: string, l: (e: never) => void) => {
        const list = e === 'onAnalyseProgress' ? analyseListeners : listeners;
        list.push(l as never);
        return { remove: jest.fn(() => list.splice(list.indexOf(l as never), 1)) };
      }),
    },
  };
});

// expo-media-library is native: Save to Photos is granted and saves unless a test overrides it.
jest.mock('expo-media-library', () => ({
  __esModule: true,
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' })),
  Asset: { create: jest.fn(async () => ({ id: 'asset-1' })) },
}));

// The RN preset stubs AppState.addEventListener with a bare jest.fn (nothing to
// remove on cleanup); give it the real shape so screens that watch the
// foreground unmount cleanly.
beforeEach(() => {
  const listen = require('react-native').AppState?.addEventListener as jest.Mock | undefined;
  listen?.mockImplementation?.(() => ({ remove: jest.fn() }));
});

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setTags: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('@intercom/intercom-react-native', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(() => Promise.resolve(true)),
    loginUnidentifiedUser: jest.fn(() => Promise.resolve(true)),
    loginUserWithUserAttributes: jest.fn(() => Promise.resolve(true)),
    setUserHash: jest.fn(() => Promise.resolve(true)),
    updateUser: jest.fn(() => Promise.resolve(true)),
    logout: jest.fn(() => Promise.resolve(true)),
    present: jest.fn(() => Promise.resolve(true)),
    presentMessageComposer: jest.fn(() => Promise.resolve(true)),
    sendTokenToIntercom: jest.fn(() => Promise.resolve(true)),
  },
}));
