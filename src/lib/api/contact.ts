import { supabase } from '../supabase';
import { toApiError } from './errors';

// The address a lifter leaves so the owner can reply to them (0027). An empty value removes it.
export async function setContactEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc('set_contact_email', { p_email: email });
  if (error) throw toApiError(error);
}
