import { router } from 'expo-router';
import type { Movement } from '../../analysis/types';
import { useOnboarding, type Units } from '../onboarding/store';
import type { CheckId } from './checks';
import { useCapture, type Clip, type ClipSource } from './store';
import type { Trim } from './trim';
import type { PlateMark } from './plateMark';
import { nextClipGate, syncKeychainUsage } from '../paywall/hooks';
import { onDeviceAnalysisEnabled } from '../../data/onDeviceAnalysis';
import { startLift } from '../../data/pipeline';

export type ClipSubmission = {
  uri: string | null;
  // Every clip is tracked the same way; the store and the server sync still want a movement, so it is always 'snatch'.
  movement: Movement;
  loadKg: number | null;
  trim: Trim;
  rep: number | 'all';
  source: ClipSource;
  fps: number | null;
  overridden: CheckId[];
  plateMark?: PlateMark | null;
};

const LB_TO_KG = 0.45359237;

export function parseWeight(text: string, units: Units): number | null {
  const v = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(v) || v <= 0) return null;
  return units === 'lb' ? Math.round(v * LB_TO_KG * 10) / 10 : v;
}

export function toSubmission(clip: Clip, weight: string, units: Units): ClipSubmission {
  return {
    uri: clip.uri,
    movement: 'snatch',
    loadKg: parseWeight(weight, units),
    trim: clip.trim,
    rep: 'all',
    source: clip.source,
    fps: clip.fps,
    overridden: clip.overridden,
    plateMark: clip.plateMark ?? null,
  };
}

// Track: the paywall gate first, then the tracking on the phone (the clip never
// leaves it, no backend or network needed), or the bundled sample where there is no
// native module (dev without it). A clip with no file (the sample) only exists in dev
// builds; a release build goes back to capture rather than play the fixture as the
// lifter's own lift.
export async function submitClip(clip: ClipSubmission, opts: { replace?: boolean } = {}): Promise<void> {
  const go = opts.replace ? router.replace : router.push;
  // The Keychain count first (a reinstall must not hand the free lifts back); the
  // gate itself is local and works offline. The server mirror is read at launch.
  await syncKeychainUsage();
  const gate = nextClipGate();
  const params = { clip: `clip-${Date.now()}`, movement: clip.movement };
  if (gate === 'paywall') return go({ pathname: '/paywall', params });
  if (gate === 'cap') return go({ pathname: '/paywall/cap', params });
  if (!clip.uri && !__DEV__) return go('/capture');
  if (!onDeviceAnalysisEnabled() || !clip.uri) {
    go({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock', count: '1' } });
    return;
  }
  startLift({ ...clip, uri: clip.uri });
  go({ pathname: '/analysis/processing', params: { live: '1' } });
}

// After a paywall or trial purchase: send the clip the lifter already picked.
// Returns false when there is no saved clip (the paywall was opened elsewhere).
export function submitDraft(opts: { replace?: boolean } = {}): boolean {
  const { draft, lastWeight } = useCapture.getState();
  if (!draft) return false;
  void submitClip(toSubmission(draft, lastWeight, useOnboarding.getState().units), opts);
  return true;
}
