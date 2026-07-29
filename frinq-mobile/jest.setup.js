/* eslint-env jest */
/* Jest environment setup for native modules used by the design system. */
require('react-native-gesture-handler/jestSetup');

// Reanimated 4's shipped mock boots the worklets native module (crashes under
// Jest), so we stub only the small API surface our motion helpers use. This
// keeps component tests fast and off the native worklets path.
jest.mock('react-native-worklets', () => ({}), { virtual: true });
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const identity = (v) => v;
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (Component) => Component,
    },
    View,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: identity,
    withDelay: (_delay, value) => value,
    withSpring: identity,
    withRepeat: (value) => value,
    Easing: { bezier: () => identity, linear: identity, ease: identity },
  };
});

// Haptics is a thin native module — no-op it in tests.
jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
  trigger: jest.fn(),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
    setAnalyticsCollectionEnabled: jest.fn().mockResolvedValue(undefined),
  }),
}));

// NetInfo ships an official Jest mock.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

// react-native-get-random-values is a native-only side-effect shim (assigns
// global.crypto.getRandomValues) that isn't transformable under Jest. The
// Node test environment already provides a real crypto.getRandomValues, so
// the polyfill import is simply a no-op here.
jest.mock('react-native-get-random-values', () => ({}));

// MMKV ships an official in-memory mock factory.
jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/createMMKV/createMockMMKV');
  return { createMMKV: jest.fn((config) => createMockMMKV(config)) };
});

// react-native-keychain has no official Jest mock — a small in-memory fake
// backed by a Map, keyed by `service`, is enough to test our adapter's logic.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    __store: store,
    setGenericPassword: jest.fn(async (username, password, opts) => {
      store.set(opts.service, { username, password });
      return true;
    }),
    getGenericPassword: jest.fn(async (opts) => store.get(opts.service) ?? false),
    resetGenericPassword: jest.fn(async (opts) => {
      store.delete(opts.service);
      return true;
    }),
  };
});

// safe-area-context renders null until it measures insets; its official mock
// provides fixed metrics so children render synchronously in tests.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// react-native-audio-api is a native module (Task 33). AudioRecorderAdapter
// constructs a real AudioRecorder unless a fake RecorderPort is injected, so
// even tests that never drive recording need this to exist and not throw.
jest.mock('react-native-audio-api', () => ({
  AudioRecorder: jest.fn().mockImplementation(() => ({
    enableFileOutput: jest.fn(() => ({ status: 'success' })),
    start: jest.fn(() => ({ status: 'success' })),
    stop: jest.fn(() => ({ status: 'success', paths: ['/cache/clip.m4a'], size: 0, duration: 0 })),
    onError: jest.fn(),
    clearOnError: jest.fn(),
  })),
  AudioManager: { requestRecordingPermissions: jest.fn().mockResolvedValue('Denied') },
  FileFormat: { M4A: 2 },
  FileDirectory: { Cache: 1 },
}));

// @dr.pogodin/react-native-fs — only `unlink` is used by AudioRecorderAdapter.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

// react-native-view-shot (Task 34) — ViewShot's ref exposes capture(); tests
// drive sharing through shareVibeCard's own cardRef, not this component, so
// a passthrough render + no-op capture is enough.
jest.mock('react-native-view-shot', () => {
  const React = require('react');
  const { View } = require('react-native');
  const ViewShot = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ capture: jest.fn().mockResolvedValue('file:///tmp/mock-capture.png') }));
    return React.createElement(View, props, props.children);
  });
  return {
    __esModule: true,
    default: ViewShot,
    captureRef: jest.fn().mockResolvedValue('file:///tmp/mock-capture.png'),
    releaseCapture: jest.fn(),
    captureScreen: jest.fn().mockResolvedValue('file:///tmp/mock-capture.png'),
  };
});

// react-native-share (Task 34) — only the default export's `.open()` is used.
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue({ success: true, message: '' }) },
}));
