// Mock AsyncStorage with proper implementation
const mockAsyncStorage = {
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve()),
};

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

describe('supabase client', () => {
  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-key-12345';
  });

  it('should have auth and from methods', () => {
    const { supabase } = require('./supabase');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
    expect(typeof supabase.auth.signInWithPassword).toBe('function');
    expect(typeof supabase.from).toBe('function');
    expect(require('./supabase').supabaseConfigured).toBe(true);
  });

  it('should export supabase and types', () => {
    const module = require('./supabase');

    expect(module.supabase).toBeDefined();
  });
});

describe('supabase client - missing env vars', () => {
  it('builds an unconfigured client so the app falls back to local stores', () => {
    jest.resetModules();
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    expect(require('./supabase').supabaseConfigured).toBe(false);

    process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prevKey;
    jest.resetModules();
  });
});
