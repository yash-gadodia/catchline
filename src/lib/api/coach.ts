import { supabase } from '../supabase';
import type { CoachLink } from '../../types/db';
import { toApiError } from './errors';

/** A no-login, read-only link for one finished lift; expires after `days` (1-30, default 14). */
export async function createCoachLink(liftId: string, days = 14): Promise<CoachLink> {
  const { data, error } = await supabase.rpc('create_coach_link', { p_lift_id: liftId, p_days: days });
  if (error) throw toApiError(error);
  return data;
}

export async function revokeCoachLink(id: string): Promise<void> {
  const { error } = await supabase.from('coach_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw toApiError(error);
}
