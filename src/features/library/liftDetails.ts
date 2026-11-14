import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// What the lifter wrote about a lift: their own name for it, tags and a note. Kept on the phone only, beside the
// lift (keyed like liftNames, by the id the player opens); nothing here is ever sent to the server.
export type LiftDetails = { name: string; tags: string[]; note: string };

export const NAME_MAX = 40;
export const TAG_MAX = 24;
export const TAGS_MAX = 8;
export const NOTE_MAX = 1000;

const NONE: LiftDetails = { name: '', tags: [], note: '' };

export const useLiftDetails = create<{ details: Record<string, LiftDetails> }>()(
  persist(() => ({ details: {} as Record<string, LiftDetails> }), { name: 'catchline-lift-details', storage: createJSONStorage(() => AsyncStorage) })
);

export function detailsOf(details: Record<string, LiftDetails>, liftId: string): LiftDetails {
  return details[liftId] ?? NONE;
}

// "#Heavy  single " reads as "Heavy single"; null when nothing is left.
export function cleanTag(raw: string): string | null {
  const tag = raw.replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX).trim();
  return tag ? tag : null;
}

// Writes what changed. A lift left with no name, tag or note keeps no entry at all.
export function setLiftDetails(liftId: string, patch: Partial<LiftDetails>): void {
  useLiftDetails.setState((s) => {
    const next = { ...detailsOf(s.details, liftId), ...patch };
    const { [liftId]: _was, ...rest } = s.details;
    const empty = !next.name.trim() && next.tags.length === 0 && !next.note.trim();
    return { details: empty ? rest : { ...rest, [liftId]: next } };
  });
}

// Adds a tag once, whatever its capitals; false when it was empty, already there, or the lift is full.
export function addLiftTag(liftId: string, raw: string): boolean {
  const tag = cleanTag(raw);
  const { tags } = detailsOf(useLiftDetails.getState().details, liftId);
  if (!tag || tags.length >= TAGS_MAX || tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return false;
  setLiftDetails(liftId, { tags: [...tags, tag] });
  return true;
}

export function removeLiftTag(liftId: string, tag: string): void {
  const { tags } = detailsOf(useLiftDetails.getState().details, liftId);
  setLiftDetails(liftId, { tags: tags.filter((x) => x !== tag) });
}

export function forgetLiftDetails(liftId: string): void {
  useLiftDetails.setState((s) => {
    const { [liftId]: _gone, ...details } = s.details;
    return { details };
  });
}

// Tags on the lifter's other lifts that this one does not have yet, most used first (then A to Z), narrowed to
// what is being typed.
export function tagSuggestions(details: Record<string, LiftDetails>, liftId: string, typed = ''): string[] {
  const mine = new Set(detailsOf(details, liftId).tags.map((x) => x.toLowerCase()));
  const count = new Map<string, { tag: string; n: number }>();
  for (const [id, d] of Object.entries(details)) {
    if (id === liftId) continue;
    for (const tag of d.tags) {
      const key = tag.toLowerCase();
      if (mine.has(key)) continue;
      count.set(key, { tag: count.get(key)?.tag ?? tag, n: (count.get(key)?.n ?? 0) + 1 });
    }
  }
  const q = (cleanTag(typed) ?? '').toLowerCase();
  return [...count.values()]
    .filter((x) => x.tag.toLowerCase().includes(q))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
    .map((x) => x.tag);
}

// Every word of the search has to be somewhere in what the lift is called, tagged, noted or loaded with.
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}
