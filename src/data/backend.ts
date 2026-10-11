import { supabaseConfigured } from '../lib/supabase';
import { ensureSession, recordConsent } from '../lib/api';
import { CONSENT_VERSION, hasConsent, useOnboarding } from '../features/onboarding/store';

// One switch for the whole app: EXPO_PUBLIC_SUPABASE_URL + ANON_KEY set means
// every repository talks to Supabase through src/lib/api; unset means the
// local fixture stores (dev mode).
export function backendEnabled(): boolean {
  return supabaseConfigured;
}

let consentFor: Promise<void> | null = null;

// create_lift refuses without a granted 'upload_privacy' consent, so this runs
// before the first createLift (and when the privacy screen is accepted). The
// consents table is append-only, so a repeat after an app restart is harmless.
export function syncConsent(): Promise<void> {
  const consent = useOnboarding.getState().consent;
  if (!hasConsent(consent) || !consent) return Promise.reject(new Error('consent_required'));
  consentFor ??= (async () => {
    await ensureSession();
    const version = String(CONSENT_VERSION);
    await recordConsent('upload_privacy', version, true);
    await recordConsent('model_training', version, consent.improveAccuracy);
  })().catch((e: unknown) => {
    consentFor = null;
    throw e;
  });
  return consentFor;
}

export function resetConsentSync(): void {
  consentFor = null;
}
