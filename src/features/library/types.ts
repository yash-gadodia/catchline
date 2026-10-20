import type { Failure, Movement } from '../../analysis/types';

export type Day = string;

export type LiftStatus = 'done' | 'processing' | 'failed' | 'queued';

export type Lift = {
  id: string;
  movement: Movement;
  date: Day;
  loadKg?: number;
  reps?: number;
  status: LiftStatus;
  analysisId?: string;
  thumb?: string;
  failure?: Failure;
  headline?: string;
  retestCueId?: string;
  // 3.1: the server's cue record for a lift whose analysis is not on this phone.
  cueId?: string;
};

export type Session = {
  id: string;
  movement: Movement;
  date: Day;
  loadKg?: number;
  liftId?: string;
  thumb?: string;
  values: Record<string, number>;
  analysisVersion?: string;
};

export type CueStatus = 'trying' | 'stuck' | 'didnt_stick' | 'dropped';

export type CueRecord = {
  id: string;
  movement: Movement;
  text: string;
  why?: string;
  metricId: string;
  givenAt: Day;
  endedAt?: Day;
  status: CueStatus;
  sessionsTarget: number;
  // Hosted path: the server's own count and the span of lifts that fed the cue.
  sessionsDone?: number;
  firstLiftId?: string;
  lastLiftId?: string;
  before: { image: string; label?: string };
  after: { image: string };
  suggestion?: { text: string; why: string };
};

export type Plan = 'free' | 'paid';

export type LibraryState = {
  today: Day;
  // False on the hosted path until the first syncLibrary() lands.
  synced: boolean;
  plan: Plan;
  freeVideosUsed: number;
  lifts: Lift[];
  sessions: Session[];
  cues: CueRecord[];
};

export const FREE_VIDEOS = 3;
