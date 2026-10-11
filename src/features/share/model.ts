import type { Analysis, Measurement } from '../../analysis/types';
import { fmt, heroValue, movementLabel } from '../../analysis/format';

export type ShareType = 'strobe_card' | 'overlay_video' | 'it_stuck' | 'sticker';
export type Aspect = '9:16' | '4:5' | '1:1';
export type ShareOption = 'path' | 'strobe' | 'cue' | 'weight' | 'coach';
export type ShareOptions = Record<ShareOption, boolean>;
export type ExportState = 'idle' | 'rendering' | 'saved' | 'failed';

export const SHARE_TYPES: { value: ShareType; label: string }[] = [
  { value: 'strobe_card', label: 'Strobe card' },
  { value: 'overlay_video', label: 'Overlay video' },
  { value: 'it_stuck', label: 'It stuck' },
  { value: 'sticker', label: 'Sticker' },
];

export const ASPECTS: Aspect[] = ['9:16', '4:5', '1:1'];

export const OPTIONS_FOR: Record<ShareType, ShareOption[]> = {
  strobe_card: ['path', 'strobe', 'cue', 'weight', 'coach'],
  overlay_video: ['path', 'cue', 'weight', 'coach'],
  it_stuck: ['weight', 'coach'],
  sticker: ['path', 'strobe'],
};

export const DEFAULT_OPTIONS: ShareOptions = { path: true, strobe: true, cue: true, weight: true, coach: false };

// Cards are laid out at a 390pt base width (the design's frame) and exported at 1080 px wide.
export const CARD_WIDTH = 390;
export const EXPORT_WIDTH = 1080;
const RATIO: Record<Aspect, number> = { '9:16': 16 / 9, '4:5': 5 / 4, '1:1': 1 };
export const STICKER_RATIO = 260 / 200;

export function cardSize(type: ShareType, aspect: Aspect): { width: number; height: number } {
  const ratio = type === 'sticker' ? STICKER_RATIO : RATIO[aspect];
  return { width: CARD_WIDTH, height: Math.round(CARD_WIDTH * ratio) };
}

export function exportSize(type: ShareType, aspect: Aspect): { width: number; height: number } {
  const ratio = type === 'sticker' ? STICKER_RATIO : RATIO[aspect];
  return { width: EXPORT_WIDTH, height: Math.round(EXPORT_WIDTH * ratio) };
}

export function aspectsFor(type: ShareType): Aspect[] {
  return type === 'sticker' ? [] : ASPECTS;
}

// Reels and TikTok cover the top (status, tabs), the bottom (caption, audio)
// and the right rail (like/comment/share). Feed posts only need a margin.
// Fractions of the card's height (top/bottom) and width (left/right); the
// 9:16 values are the union of both apps on a 1080x1920 frame.
export type Insets = { top: number; bottom: number; left: number; right: number };
const SAFE: Record<Aspect, Insets> = {
  '9:16': { top: 0.14, bottom: 0.2, left: 0.06, right: 0.12 },
  '4:5': { top: 0.05, bottom: 0.05, left: 0.06, right: 0.06 },
  '1:1': { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
};

export function safeInsets(aspect: Aspect, size: { width: number; height: number }): Insets {
  const s = SAFE[aspect];
  return {
    top: Math.round(s.top * size.height),
    bottom: Math.round(s.bottom * size.height),
    left: Math.round(s.left * size.width),
    right: Math.round(s.right * size.width),
  };
}

// The free-tier watermark carries the cue, so a watermarked card still reads as a post.
export function watermarkText(a: Analysis, pro: boolean): string | null {
  if (pro) return null;
  const cue = a.cue?.text.toLowerCase();
  return cue ? `catchline · ${cue}` : 'catchline';
}

export function cueMeasurement(a: Analysis): Measurement | null {
  const ev = a.cue?.evidence;
  if (!ev) return null;
  return a.measurements.find((m) => m.unit === ev.unit && m.value === ev.value) ?? null;
}

export type CardCopy = { hero: string | null; cue: string | null; meta: string };

export function cardCopy(a: Analysis, options: ShareOptions, coachHandle: string | null, full = true): CardCopy {
  const parts = [movementLabel(a.movement).toLowerCase()];
  if (options.weight && a.loadKg != null) parts.push(`${fmt(a.loadKg)} kg`);
  const m = cueMeasurement(a);
  if (full && m) {
    parts.push(m.label.toLowerCase());
    if (m.best != null) parts.push(`best ${fmt(m.best)}`);
  }
  if (options.coach && coachHandle) parts.push(`coach ${coachHandle}`);
  return {
    hero: a.cue ? heroValue(a.cue) : null,
    cue: options.cue && a.cue ? a.cue.text : null,
    meta: parts.join(' · '),
  };
}

export type Stuck = {
  label: string;
  unit: string;
  before: { dateLabel: string; value: number; image?: string };
  after: { dateLabel: string; value: number; image?: string };
  weeks: number;
};

export function stuckLine(s: Stuck): string {
  return `${s.label} ${fmt(s.before.value)} → ${fmt(s.after.value)} ${s.unit} · ${s.weeks} ${s.weeks === 1 ? 'week' : 'weeks'}`;
}

export function exportLabel(type: ShareType): string {
  return type === 'overlay_video' ? 'Save video' : 'Save to Photos';
}
