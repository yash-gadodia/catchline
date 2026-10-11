import { supabase } from '../supabase';
import type { CueRow, CueStatus } from '../../types/db';
import { toApiError } from './errors';

export async function listCues(opts: { status?: CueStatus[] } = {}): Promise<CueRow[]> {
  let q = supabase.from('cues').select('*').order('updated_at', { ascending: false });
  if (opts.status) q = q.in('status', opts.status);
  const { data, error } = await q;
  if (error) throw toApiError(error);
  return data ?? [];
}

/** The only field the lifter can change: trying / stuck / didnt_stick / dropped. */
export async function updateCue(id: string, status: CueStatus): Promise<CueRow> {
  const { data, error } = await supabase.from('cues').update({ status }).eq('id', id).select('*').single();
  if (error) throw toApiError(error);
  return data;
}
