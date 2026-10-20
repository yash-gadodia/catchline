import { router } from 'expo-router';
import type { Movement } from '../../analysis/types';
import { useOnboarding, type Units } from '../onboarding/store';
import type { CheckId } from './checks';
import { activeTrim, useCapture, type Clip, type ClipSource } from './store';
import type { Trim } from './trim';
import { nextClipGate, syncKeychainUsage } from '../paywall/hooks';
import { backendEnabled } from '../../data/backend';
import { startLift } from '../../data/pipeline';

export type ClipSubmission = {
  uri: string | null;
  movement: Movement;
  loadKg: number | null;
  trim: Trim;
  rep: number | 'all';
  source: ClipSource;
  fps: number | null;
  overridden: CheckId[];
  retestCueId?: string;
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
    movement: clip.movement,
    loadKg: parseWeight(weight, units),
    trim: activeTrim(clip),
    rep: clip.rep,
    source: clip.source,
    fps: clip.fps,
    overridden: clip.overridden,
    // A clip moved to another movement is no longer a test of that cue.
    retestCueId: clip.retest?.movement === clip.movement ? clip.retest.cueId : undefined,
  };
}

// Analyse: the paywall gate first (the clip stays on the phone either way),
// then the backend pipeline, or the bundled sample in dev mode. A clip with no
// file (the sample) only exists in dev builds; a release build goes back to
// capture rather than play the fixture as the lifter's own lift.
export async function submitClip(clip: ClipSubmission, opts: { replace?: boolean } = {}): Promise<void> {
  const go = opts.replace ? router.replace : router.push;
  // The Keychain count first (a reinstall must not hand the free lifts back); the
  // gate itself is local and works offline. The server mirror is read at launch.
  await syncKeychainUsage();
  const gate = nextClipGate();
  const params = { clip: `clip-${Date.now()}`, movement: clip.movement };
  if (gate === 'paywall') return go({ pathname: '/paywall', params });
  if (gate === 'cap') return go({ pathname: '/paywall/cap', params });
  if (gate === 'trial') return go('/paywall/funnel/trial');
  if (!clip.uri && !__DEV__) return go('/capture');
  if (!backendEnabled() || !clip.uri) {
    go({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock', count: '1', ...(clip.retestCueId ? { retest: clip.retestCueId } : {}) } });
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
