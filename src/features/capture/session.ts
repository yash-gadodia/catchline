// The record button's state machine. Pure, so the viewfinder only wires timers
// and the camera to it.

export const COUNTDOWN_FROM = 5;
export const TOO_LONG_S = 30;
export const MAX_RECORD_S = 120;
export const LOW_STORAGE_S = 60;

export type RepsMode = 'rep' | 'set';

export type Session =
  | { kind: 'idle' }
  | { kind: 'storage'; secondsLeft: number }
  | { kind: 'countdown'; n: number }
  | { kind: 'recording'; elapsed: number }
  | { kind: 'stopping'; elapsed: number };

export type SessionEvent =
  | { type: 'press'; secondsLeft: number }
  | { type: 'recordAnyway' }
  | { type: 'dismissStorage' }
  | { type: 'tick' }
  | { type: 'cancel' };

function begin(): Session {
  return { kind: 'countdown', n: COUNTDOWN_FROM };
}

export function reduce(s: Session, e: SessionEvent): Session {
  switch (e.type) {
    case 'press':
      if (s.kind === 'idle') return e.secondsLeft < LOW_STORAGE_S ? { kind: 'storage', secondsLeft: e.secondsLeft } : begin();
      if (s.kind === 'countdown') return { kind: 'idle' };
      if (s.kind === 'recording') return { kind: 'stopping', elapsed: s.elapsed };
      return s;
    case 'recordAnyway':
      return s.kind === 'storage' ? begin() : s;
    case 'dismissStorage':
      return s.kind === 'storage' ? { kind: 'idle' } : s;
    case 'tick':
      if (s.kind === 'countdown') return s.n > 1 ? { kind: 'countdown', n: s.n - 1 } : { kind: 'recording', elapsed: 0 };
      if (s.kind === 'recording') {
        const elapsed = s.elapsed + 1;
        return elapsed >= MAX_RECORD_S ? { kind: 'stopping', elapsed } : { kind: 'recording', elapsed };
      }
      return s;
    case 'cancel':
      return { kind: 'idle' };
  }
}

export function isTooLong(s: Session): boolean {
  return s.kind === 'recording' && s.elapsed > TOO_LONG_S;
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
