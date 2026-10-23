import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONSENT_VERSION, hasConsent, useOnboarding } from './store';

beforeEach(() => useOnboarding.getState().reset());

describe('onboarding store', () => {
  it('records consent with its version and time, and persists it', async () => {
    useOnboarding.getState().acceptConsent(new Date('2026-10-11T09:30:00Z'));
    expect(useOnboarding.getState().consent).toEqual({ version: CONSENT_VERSION, acceptedAt: '2026-10-11T09:30:00.000Z' });
    const saved = JSON.parse((await AsyncStorage.getItem('catchline.onboarding'))!);
    expect(saved.state.consent).toEqual({ version: 1, acceptedAt: '2026-10-11T09:30:00.000Z' });
  });

  it('treats no consent, or consent to an older version, as none', () => {
    expect(hasConsent(null)).toBe(false);
    expect(hasConsent({ version: 0, acceptedAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(hasConsent({ version: CONSENT_VERSION, acceptedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('remembers the account choice until reset', () => {
    expect(useOnboarding.getState().accountChoice).toBeNull();
    useOnboarding.getState().setAccountChoice('none');
    expect(useOnboarding.getState().accountChoice).toBe('none');
    useOnboarding.getState().setAccountChoice('apple');
    expect(useOnboarding.getState().accountChoice).toBe('apple');
    useOnboarding.getState().reset();
    expect(useOnboarding.getState().accountChoice).toBeNull();
  });

  it('saves lifts, focus and units', () => {
    useOnboarding.getState().setLifts(['snatch', 'bar_muscle_up'], ['Missing behind'], 'lb');
    const s = useOnboarding.getState();
    expect([s.lifts, s.focus, s.units]).toEqual([['snatch', 'bar_muscle_up'], ['Missing behind'], 'lb']);
  });
});
