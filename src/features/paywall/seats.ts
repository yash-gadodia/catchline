import { backendEnabled } from '../../data/backend';
import { foundingSeats } from '../../lib/api';
import { FOUNDING_SEATS_TOTAL } from './entitlements';

export type FoundingSeats = { total: number; remaining: number };
export type FoundingState = 'open' | 'low' | 'soldOut';

// The seam for the live counter: the founding_seats() RPC (founders set by the
// RevenueCat webhook) when the backend is on, a local stub in fixture mode.
export interface SeatsSource {
  getFoundingSeats(): Promise<FoundingSeats>;
}

export const localSeats: SeatsSource = {
  getFoundingSeats: async () => ({ total: FOUNDING_SEATS_TOTAL, remaining: 137 }),
};

export const remoteSeats: SeatsSource = {
  getFoundingSeats: async () => {
    const { taken, cap } = await foundingSeats();
    return { total: cap, remaining: Math.max(cap - taken, 0) };
  },
};

let source: SeatsSource = backendEnabled() ? remoteSeats : localSeats;

export function setSeatsSource(next: SeatsSource): void {
  source = next;
}

export function getFoundingSeats(): Promise<FoundingSeats> {
  return source.getFoundingSeats();
}

export function foundingState(seats: FoundingSeats): FoundingState {
  if (seats.remaining <= 0) return 'soldOut';
  if (seats.remaining < seats.total * 0.1) return 'low';
  return 'open';
}

export function seatsLeftLabel(seats: FoundingSeats): string {
  return `${seats.remaining} of ${seats.total} left`;
}

export function seatsFraction(seats: FoundingSeats): number {
  if (seats.total <= 0) return 0;
  return Math.min(1, Math.max(0, seats.remaining / seats.total));
}
