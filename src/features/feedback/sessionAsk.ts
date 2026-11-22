// One ask per run of the app: the feedback ask and the App Store rating ask never both show before the app restarts.
export type SessionAsk = 'feedback' | 'rating';

let claimed: SessionAsk | null = null;

export function claimSessionAsk(kind: SessionAsk): boolean {
  if (claimed && claimed !== kind) return false;
  claimed = kind;
  return true;
}

export function resetSessionAsk(): void {
  claimed = null;
}
