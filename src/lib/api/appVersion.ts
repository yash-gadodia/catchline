import { supabase } from '../supabase';
import { toApiError } from './errors';

export type VersionFlags = { min: string | null; recommended: string | null };

export const MIN_VERSION_KEY = 'min_app_version';
export const RECOMMENDED_VERSION_KEY = 'recommended_app_version';

// A version row counts only while enabled; its version is the note.
export async function getVersionFlags(): Promise<VersionFlags> {
  const { data, error } = await supabase.from('feature_flags').select('key, enabled, note').in('key', [MIN_VERSION_KEY, RECOMMENDED_VERSION_KEY]);
  if (error) throw toApiError(error);
  const value = (key: string) => {
    const row = (data ?? []).find((r) => r.key === key);
    return row?.enabled && row.note?.trim() ? row.note.trim() : null;
  };
  return { min: value(MIN_VERSION_KEY), recommended: value(RECOMMENDED_VERSION_KEY) };
}
