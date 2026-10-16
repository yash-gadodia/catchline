import type { Analysis, Measurement } from '../../analysis/types';
import { fmt, heroValue, movementLabel } from '../../analysis/format';
import type { ShareAspect } from './overlay';

// The still card is laid out at a 390pt base width (the design's frame) and
// captured at 1080 px wide.
export const CARD_WIDTH = 390;
const RATIO: Record<ShareAspect, number> = { '9:16': 16 / 9, '4:5': 5 / 4 };

export function cardSize(aspect: ShareAspect): { width: number; height: number } {
  return { width: CARD_WIDTH, height: Math.round(CARD_WIDTH * RATIO[aspect]) };
}

// Story UI covers the top (progress bar, avatar), the bottom (reply bar) and
// the reels right rail; feed posts only need a margin. Fractions of the card.
export type Insets = { top: number; bottom: number; left: number; right: number };
const SAFE: Record<ShareAspect, Insets> = {
  '9:16': { top: 0.13, bottom: 0.18, left: 0.06, right: 0.11 },
  '4:5': { top: 0.05, bottom: 0.05, left: 0.06, right: 0.06 },
};

export function safeInsets(aspect: ShareAspect, size: { width: number; height: number }): Insets {
  const s = SAFE[aspect];
  return {
    top: Math.round(s.top * size.height),
    bottom: Math.round(s.bottom * size.height),
    left: Math.round(s.left * size.width),
    right: Math.round(s.right * size.width),
  };
}

export function cueMeasurement(a: Analysis): Measurement | null {
  const ev = a.cue?.evidence;
  if (!ev) return null;
  return a.measurements.find((m) => m.unit === ev.unit && m.value === ev.value) ?? null;
}

export type CardCopy = { hero: string | null; label: string | null; cue: string | null; meta: string };

export function cardCopy(a: Analysis): CardCopy {
  const parts = [movementLabel(a.movement).toLowerCase()];
  if (a.loadKg != null) parts.push(`${fmt(a.loadKg)} kg`);
  return {
    hero: a.cue ? heroValue(a.cue) : null,
    label: cueMeasurement(a)?.label ?? null,
    cue: a.cue?.text ?? null,
    meta: parts.join(' · '),
  };
}
