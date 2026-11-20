import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureSession, setContactEmail } from '../lib/api';
import { EVENTS, track } from '../lib/analytics';
import { backendEnabled } from './backend';

// The email a lifter chose to leave, so the owner can reply to them. Kept on the phone to fill the field next time,
// and sent to the server (set_contact_email), where it is used for the owner's own emails and nothing else.
export const useContact = create<{ email: string; synced: boolean }>()(
  persist((): { email: string; synced: boolean } => ({ email: '', synced: false }), { name: 'catchline-contact', storage: createJSONStorage(() => AsyncStorage) })
);

export const EMAIL_MAX = 254;
export function validEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length <= EMAIL_MAX && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// Saves a valid address and sends it; an address that did not reach the server goes again at the next launch.
export async function leaveContactEmail(raw: string): Promise<boolean> {
  const email = raw.trim().toLowerCase();
  if (!validEmail(email)) return false;
  useContact.setState({ email, synced: false });
  track(EVENTS.CONTACT_EMAIL_LEFT, {});
  return flushContactEmail();
}

export async function flushContactEmail(): Promise<boolean> {
  const { email, synced } = useContact.getState();
  if (!email || synced || !backendEnabled()) return synced;
  try {
    await ensureSession();
    await setContactEmail(email);
    useContact.setState({ synced: true });
    return true;
  } catch {
    return false;
  }
}
