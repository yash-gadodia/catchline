import { router } from 'expo-router';
import type { Movement } from '../../analysis/types';
import { KG_PER_LB } from '../../analysis/format';
import { useOnboarding, type Units } from '../onboarding/store';
import type { CheckId } from './checks';
import { useCapture, type Clip, type ClipSource } from './store';
import type { Trim } from './trim';
import type { PlateMark } from './plateMark';
import { nextClipGate, syncKeychainUsage } from '../paywall/hooks';
import { onDeviceAnalysisEnabled } from '../../data/onDeviceAnalysis';
import { startLift } from '../../data/pipeline';
import { deviceLiftInFlight, holdDeviceLift, trackHeldLifts } from '../../data/devicePipeline';
import { usePendingLifts } from '../../data/pendingLifts';

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
  // the lifter skipped the plate check ("My lift has no barbell"), not just a lift that was never asked
  plateSkipped?: boolean;
};

export function parseWeight(text: string, units: Units): number | null {
  const v = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(v) || v <= 0) return null;
  const kg = Math.round((units === 'lb' ? v * KG_PER_LB : v) * 10) / 10;
  // the server keeps 0 < kg < 500; a load outside it would be refused on every sync
  return kg > 0 && kg < 500 ? kg : null;
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
    ...(clip.plateMark === null ? { plateSkipped: true } : {}),
  };
}

// Track: the paywall gate first, then the tracking on the phone (the clip never
// leaves it, no backend or network needed), or the bundled sample where there is no
// native module (dev without it). A clip with no file (the sample) only exists in dev
// builds; a release build goes back to capture rather than play the fixture as the
// lifter's own lift.
let submitting = false;

export async function submitClip(clip: ClipSubmission, opts: { replace?: boolean } = {}): Promise<void> {
  // a second tap while the first is still reading the Keychain would start a second lift
  if (submitting) return;
  submitting = true;
  try {
    await submitOnce(clip, opts);
  } finally {
    submitting = false;
  }
}

async function submitOnce(clip: ClipSubmission, opts: { replace?: boolean }): Promise<void> {
  const go = opts.replace ? router.replace : router.push;
  // One lift tracks at a time (they share the phone's models): one the lifter cancelled finishes its last pass
  // first, and a clip tracked while another still is waits behind it (#252).
  const cancelled = deviceLiftInFlight();
  if (cancelled?.cancelled) await cancelled.done;
  // The Keychain count first (a reinstall must not hand the free lifts back); the
  // gate itself is local and works offline. The server mirror is read at launch.
  await syncKeychainUsage();
  // a clip saved at the cap goes before this one when the gate lets it (#247), and the lifts already tracking or
  // waiting spend a free lifter's videos first
  if (onDeviceAnalysisEnabled()) trackHeldLifts();
  // the same clip again (a second Track on the same draft) is the lift already on its way, not another one
  const same = (s: ClipSubmission) => s.uri === clip.uri && s.trim.start === clip.trim.start && s.trim.end === clip.trim.end;
  if (clip.uri && usePendingLifts.getState().items.some((i) => !i.held && same(i.sub))) return go({ pathname: '/analysis/processing', params: { live: '1' } });
  const gate = nextClipGate(new Date(), usePendingLifts.getState().items.filter((i) => !i.held).length);
  const params = { clip: `clip-${Date.now()}`, movement: clip.movement };
  if (gate === 'paywall') return go({ pathname: '/paywall', params });
  if (gate === 'cap') {
    // saved, as the cap sheet says: tracked first after a purchase or when the free video is back
    if (clip.uri && onDeviceAnalysisEnabled() && !usePendingLifts.getState().items.some((i) => same(i.sub))) holdDeviceLift({ ...clip, uri: clip.uri });
    return go({ pathname: '/paywall/cap', params });
  }
  if (!clip.uri && !__DEV__) return go('/capture');
  if (!onDeviceAnalysisEnabled() || !clip.uri) {
    go({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock', count: '1' } });
    return;
  }
  const busy = deviceLiftInFlight();
  startLift({ ...clip, uri: clip.uri });
  // it waits for the one tracking: Lifts lists it as waiting, the in-flight bar above it follows the other
  if (busy) return router.dismissTo('/');
  go({ pathname: '/analysis/processing', params: { live: '1' } });
}

// After a purchase or restore on the paywall: the clip saved at the cap is tracked (it goes first, #247).
// Returns false when none was saved or the gate still holds it.
export function trackHeld(opts: { replace?: boolean } = {}): boolean {
  if (!onDeviceAnalysisEnabled() || !trackHeldLifts()) return false;
  (opts.replace ? router.replace : router.push)({ pathname: '/analysis/processing', params: { live: '1' } });
  return true;
}

// Track on the clip the lifter picked (trim, the plate check, a retry). Returns false when there is none.
export function submitDraft(opts: { replace?: boolean } = {}): boolean {
  const { draft, lastWeight } = useCapture.getState();
  if (!draft) return false;
  void submitClip(toSubmission(draft, lastWeight, useOnboarding.getState().units), opts);
  return true;
}
