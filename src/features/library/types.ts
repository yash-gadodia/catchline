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
};

export type Session = {
  id: string;
  movement: Movement;
  date: Day;
  loadKg?: number;
  liftId?: string;
  thumb?: string;
  values: Record<string, number>;
};

export type CueStatus = 'trying' | 'stuck' | 'didnt_stick' | 'dropped';

export type CueRecord = {
  id: string;
  movement: Movement;
  text: string;
  metricId: string;
  givenAt: Day;
  endedAt?: Day;
  status: CueStatus;
  sessionsTarget: number;
  before: { image: string; label?: string };
  after: { image: string };
  suggestion?: { text: string; why: string };
};

export type Plan = 'free' | 'paid';

export type LibraryState = {
  today: Day;
  plan: Plan;
  freeVideosUsed: number;
  lifts: Lift[];
  sessions: Session[];
  cues: CueRecord[];
};

export const FREE_VIDEOS = 3;
