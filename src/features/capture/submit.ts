import { router } from 'expo-router';
import type { Movement } from '../../analysis/types';
import type { Units } from '../onboarding/store';
import type { CheckId } from './checks';
import { activeTrim, type Clip, type ClipSource } from './store';
import type { Trim } from './trim';

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

// Phase 3: upload the trimmed clip with its metadata, create the analysis and
// route to processing with its id. For now every clip lands on the mock.
export async function submitClip(_clip: ClipSubmission): Promise<void> {
  router.push({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock' } });
}
