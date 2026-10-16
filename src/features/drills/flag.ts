import { useEffect, useState } from 'react';
import { backendEnabled } from '../../data/backend';
import { supabase } from '../../lib/supabase';
import type { Drill } from './drills';

const SERVER_SWITCH = 'drills';
let cached: Promise<boolean> | null = null;

// feature_flags.drills (0013), read once per launch the way onDevicePose reads on_device_pose.
export function drillsFlag(): Promise<boolean> {
  cached ??= (async () => {
    if (!backendEnabled()) return false;
    try {
      const { data } = await supabase.from('feature_flags').select('enabled').eq('key', SERVER_SWITCH).maybeSingle();
      return data?.enabled === true;
    } catch {
      return false;
    }
  })();
  return cached;
}

export function resetDrillsFlag() {
  cached = null;
}

// A draft drill shows only in dev builds or with the server switch on; a reviewed one always.
export function drillVisible(drill: Drill, flag: boolean, dev: boolean = __DEV__): boolean {
  return !drill.draft || dev || flag;
}

export function useDrillsFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    drillsFlag().then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}
