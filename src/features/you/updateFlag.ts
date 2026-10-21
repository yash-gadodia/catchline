import { useEffect, useState } from 'react';
import { backendEnabled } from '../../data/backend';
import { supabase } from '../../lib/supabase';

const SERVER_SWITCH = 'require_update_31';
let cached: Promise<boolean> | null = null;

// feature_flags.require_update_31: once 3.1 is live, the server analysis this binary
// needs is retired and capture shows the update screen. A missing row or no network
// reads as off, and only an "on" is kept for the launch so an early miss retries.
export function requireUpdateFlag(): Promise<boolean> {
  cached ??= (async () => {
    if (!backendEnabled()) return false;
    try {
      const { data } = await supabase.from('feature_flags').select('enabled').eq('key', SERVER_SWITCH).maybeSingle();
      return data?.enabled === true;
    } catch {
      return false;
    }
  })().then((on) => {
    if (!on) cached = null;
    return on;
  });
  return cached;
}

export function resetRequireUpdateFlag() {
  cached = null;
}

export function useRequireUpdate(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    requireUpdateFlag().then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}
