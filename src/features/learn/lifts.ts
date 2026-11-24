import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';

// A world-class lift on the Learn tab: its clip and what the tracker made of it, as the phone saves a lift
// (scripts/make-sample.sh writes the three files from a tracked lift's folder).
export type LearnLift = {
  id: string;
  lifter: string;
  kind: 'snatch' | 'cleanJerk';
  loadKg?: number;
  // where and when: "World Championships 2023, training hall"
  where?: string;
  // who owns the video; shown under the lift
  credit: string;
  clip: number;
  analysis: Analysis;
  body: Body;
};

// A lift goes in here only once the video's owner has agreed IN WRITING to its use inside the Catchline app (a yes to
// posting on social media does not cover it), and the owner has seen its tracked result. Keep the approval on file.
export const LEARN_LIFTS: LearnLift[] = [];

// The tab is a promise that there is something to see: it appears once this many lifts are in.
export const LEARN_MIN = 5;
export const learnOpen = (lifts: LearnLift[] = LEARN_LIFTS) => lifts.length >= LEARN_MIN;
