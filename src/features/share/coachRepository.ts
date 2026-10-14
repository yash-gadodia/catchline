import { create } from 'zustand';
import { backendEnabled } from '../../data/backend';
import { createCoachLink } from '../../lib/api';
import { COACH_LINK_BASE } from '../../lib/links';

export type CoachLink = {
  id: string;
  analysisId: string;
  url: string;
  includeCue: boolean;
  includeRecent: boolean;
  createdAt: string;
  expiresAt: string;
};

export type CoachOverride = {
  analysisId: string;
  coachName: string;
  text: string;
  replacedCue: string;
  metricLabel: string;
  createdAt: string;
};

export type Coach = { name: string; handle: string };

export interface CoachRepository {
  createLink(analysisId: string, opts: { includeCue: boolean; includeRecent: boolean }): Promise<CoachLink>;
  getOverride(analysisId: string): CoachOverride | null;
  // What the coach page's "Send to <athlete>" posts; Phase 3 receives it server-side.
  saveOverride(o: CoachOverride): Promise<void>;
  getCoach(): Coach | null;
}

export const LINK_DAYS = 30;
export const LINK_BASE = COACH_LINK_BASE;

const DAY_MS = 24 * 60 * 60 * 1000;

function linkId(seq: number): string {
  return (0x7f3a + seq).toString(16);
}

type State = {
  links: CoachLink[];
  overrides: Record<string, CoachOverride>;
  coach: Coach | null;
};

// SIM: a local store stands in for Supabase until Phase 3. Seeded with the
// coach override from the design so the "From your coach" display has data.
export const useCoachStore = create<State>(() => ({
  links: [],
  overrides: {
    'snatch-mock': {
      analysisId: 'snatch-mock',
      coachName: 'Dani',
      text: 'Sit back into the start, chest up. Pull slower off the floor.',
      replacedCue: 'Stay over the bar longer',
      metricLabel: 'Bar drift at hip',
      createdAt: '2026-10-11T08:30:00.000Z',
    },
  },
  coach: { name: 'Dani', handle: '@coachdani' },
}));

export function createLocalCoachRepository(now: () => Date = () => new Date()): CoachRepository {
  return {
    async createLink(analysisId, opts) {
      const { links } = useCoachStore.getState();
      const created = now();
      const id = linkId(links.length);
      const link: CoachLink = {
        id,
        analysisId,
        url: `${LINK_BASE}${id}`,
        includeCue: opts.includeCue,
        includeRecent: opts.includeRecent,
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + LINK_DAYS * DAY_MS).toISOString(),
      };
      useCoachStore.setState({ links: [...links, link] });
      return link;
    },
    getOverride(analysisId) {
      return useCoachStore.getState().overrides[analysisId] ?? null;
    },
    async saveOverride(o) {
      const { overrides } = useCoachStore.getState();
      useCoachStore.setState({ overrides: { ...overrides, [o.analysisId]: o } });
    },
    getCoach() {
      return useCoachStore.getState().coach;
    },
  };
}

// Backend mode: the link is a real coach_links row for the lift (Analysis.id is
// the lift id); the coach's reply still arrives through the local store until
// the coach page exists.
export function createApiCoachRepository(): CoachRepository {
  const local = createLocalCoachRepository();
  return {
    ...local,
    async createLink(analysisId, opts) {
      const row = await createCoachLink(analysisId, LINK_DAYS);
      const link: CoachLink = {
        id: row.id,
        analysisId,
        url: `${LINK_BASE}${row.token}`,
        includeCue: opts.includeCue,
        includeRecent: opts.includeRecent,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
      useCoachStore.setState((s) => ({ links: [...s.links, link] }));
      return link;
    },
  };
}

export const coachRepository = backendEnabled() ? createApiCoachRepository() : createLocalCoachRepository();

export function useCoachOverride(analysisId: string): CoachOverride | null {
  return useCoachStore((s) => s.overrides[analysisId] ?? null);
}

export function useCoach(): Coach | null {
  return useCoachStore((s) => s.coach);
}
