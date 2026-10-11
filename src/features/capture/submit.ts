import { router } from 'expo-router';
import type { Movement } from '../../analysis/types';
import type { Units } from '../onboarding/store';
import type { CheckId } from './checks';
import { activeTrim, type Clip, type ClipSource } from './store';
import type { Trim } from './trim';
import { nextClipGate } from '../paywall/hooks';
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
  };
}

// Analyse: the paywall gate first (the clip stays on the phone either way),
// then the backend pipeline, or the bundled sample in dev mode.
export async function submitClip(clip: ClipSubmission): Promise<void> {
  const gate = nextClipGate();
  const params = { clip: `clip-${Date.now()}`, movement: clip.movement };
  if (gate === 'paywall') return router.push({ pathname: '/paywall', params });
  if (gate === 'cap') return router.push({ pathname: '/paywall/cap', params });
  if (gate === 'trial') return router.push('/paywall/funnel/trial');
  if (!backendEnabled() || !clip.uri) {
    router.push({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock', count: '1' } });
    return;
  }
  startLift({ ...clip, uri: clip.uri });
  router.push({ pathname: '/analysis/processing', params: { live: '1' } });
}
