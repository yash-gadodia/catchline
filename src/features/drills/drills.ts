// DRAFT CONTENT. Every drill below is `draft: true` until a coach has reviewed it
// (name, steps, dose, why). Only flip `draft` to false after that review; a draft
// drill shows only in dev builds or when feature_flags.drills is on.
// Source: ~/dev/liftcheck-research/25-cue-library.md section 4; review copy in
// ~/dev/liftcheck-research/40-drills-draft.md. Keyed by the CV fault id
// (cv/catchline_cv/rules.py RULES).

import { isKey, t } from '../../i18n';

export type Drill = {
  faultId: string;
  name: string;
  steps: string[];
  dose: string;
  why: string;
  draft: boolean;
};

export const DRILLS: Record<string, Drill> = {
  hips_rise_early: {
    faultId: 'hips_rise_early',
    name: 'Pause deadlift at lift-off and the knee',
    steps: [
      'Use the grip of the lift you filmed. Pull the bar 5 cm off the floor and hold 2 s.',
      'Keep pulling to just above the knee and hold 2 s, shoulders over the bar.',
      'Stand up, then lower under control.',
    ],
    dose: '3 x 3, at a weight where your back angle holds',
    why: 'Holding at the knee teaches the hips and chest to rise together, the back-angle change we measured from the floor to the knee.',
    draft: true,
  },
  bar_forward_off_hips: {
    faultId: 'bar_forward_off_hips',
    name: 'Power-position lift with a 2 s pause',
    steps: [
      'Stand tall with the bar at the top of your thighs, knees soft.',
      'Hold 2 s, then push through the floor and slide the bar up your body.',
      'Pull under and catch.',
    ],
    dose: '4 x 2, light',
    why: 'Starting at the hip makes the leg push move the bar, so it travels up after contact rather than the forward swing we measured.',
    draft: true,
  },
  jump_forward: {
    faultId: 'jump_forward',
    name: 'No-foot snatch or clean',
    steps: [
      'Lift as normal but keep your feet flat in place the whole rep.',
      'Catch without moving your feet.',
      'Finish with one normal rep with a tape line at your toes.',
    ],
    dose: '4 x 2 at 60 to 70 %',
    why: 'With the feet planted the bar has to go straight up, which is the pull that lands your feet where they started instead of the distance forward we measured.',
    draft: true,
  },
  early_arm_bend: {
    faultId: 'early_arm_bend',
    name: 'Clean pull from the power position, loose grip',
    steps: [
      'Hold the bar loosely at the top of your thighs, arms long.',
      'Stand up hard through the legs and let the bar ride up; elbows stay straight until the hips finish.',
      'Then power cleans from the same spot, starting a little lower each week.',
    ],
    dose: '3 x 3, light',
    why: 'A loose grip makes an early arm pull hard to do, so the hips finish before the elbows bend, the timing we measured.',
    draft: true,
  },
  incomplete_extension: {
    faultId: 'incomplete_extension',
    name: 'Clean high pull + clean',
    steps: [
      'Pull from the floor into a high pull, standing fully tall at the top.',
      'Lower to the floor, then one clean with the same tall finish before you pull under.',
    ],
    dose: '4 x (2 + 1) at 60 to 70 %',
    why: 'The high pull rehearses opening the hips all the way before you go under, the hip angle we measured short of straight.',
    draft: true,
  },
  forward_dip: {
    faultId: 'forward_dip',
    name: 'Pause jerk dip squat',
    steps: [
      'Bar in the front rack, dip over 3 to 5 s with the torso upright.',
      'Hold the bottom 2 s with the bar over mid-foot.',
      'Stand straight up.',
    ],
    dose: '4 x 3',
    why: 'A slow dip with a hold trains the bar to travel straight down and up, the forward drift we measured in your dip.',
    draft: true,
  },
  press_out: {
    faultId: 'press_out',
    name: 'Push press with a held lock-out',
    steps: [
      'Dip, drive and press to full lock-out.',
      'Hold every rep overhead for half a second, elbows locked.',
      'Follow with 2 jerks from the same rack.',
    ],
    dose: '4 x 3, light',
    why: 'Locking and holding each rep trains the elbows to be straight as the bar peaks, the gap we measured before the press.',
    draft: true,
  },
  chest_dive: {
    faultId: 'chest_dive',
    name: 'Jerk balance',
    steps: [
      'Start in a short split: back foot in place, front foot a third of the way forward.',
      'Dip and drive, stepping only the front foot forward as the bar goes up.',
      'Land chest tall with your weight even on both feet.',
    ],
    dose: '4 x 3, empty bar or light',
    why: 'Moving only the front foot teaches the hips to travel under the bar, the forward trunk lean we measured in the split.',
    draft: true,
  },
  bar_forward_overhead: {
    faultId: 'bar_forward_overhead',
    name: 'Jerk behind the neck',
    steps: [
      'Take the bar from the back rack with your jerk grip.',
      'Dip, drive and split, sending the bar straight up.',
      'Hold each lock-out 2 s with the bar over the back of your neck.',
    ],
    dose: '4 x 3 at 60 to 70 %',
    why: 'Starting behind the head grooves a lock-out over the shoulders, where we measured the bar finishing in front.',
    draft: true,
  },
  leg_kip: {
    faultId: 'leg_kip',
    name: 'Kip swing with a towel between the feet',
    steps: [
      'Hang from the bar and pinch a towel between your feet.',
      'Swing front to back from the shoulders, legs straight and together.',
      'Stop dead in the hang on the last swing.',
    ],
    dose: '3 x 10',
    why: 'The towel keeps the knees straight, so the swing has to come from the shoulders instead of the knee bend we measured.',
    draft: true,
  },
  early_arm_pull: {
    faultId: 'early_arm_pull',
    name: 'Kip swing into a straight-arm lat pull',
    steps: [
      'Hang and swing arch to hollow 5 times.',
      'On the hollow, press the bar down towards your hips with straight arms, 5 times.',
      'Elbows stay straight the whole set.',
    ],
    dose: '3 x (5 swings + 5 pulls)',
    why: 'Pressing with straight arms teaches the hips to open before the elbows bend, the timing we measured.',
    draft: true,
  },
  no_push_away: {
    faultId: 'no_push_away',
    name: 'Strict pull-up + push-away',
    steps: [
      'One strict pull-up, chin over the bar.',
      'Push the bar away and fall back into a hollow.',
      'Flow into one kip swing, then stop.',
    ],
    dose: '3 x 5',
    why: 'It rehearses pushing back off the bar at the top, which we measured as missing, so the next swing has something to load.',
    draft: true,
  },
  bmu_early_pull: {
    faultId: 'bmu_early_pull',
    name: 'Box press-down + toe-assisted muscle-up',
    steps: [
      'Set a box under the bar and hang with your toes on it.',
      'Do 2 arch-to-hollow press-downs with straight arms.',
      'Then 1 muscle-up with your toes on the box to help.',
    ],
    dose: '4 rounds',
    why: 'Pressing down with straight arms lets the hips rise to the bar before the elbows bend, the hip height we measured.',
    draft: true,
  },
  hips_low_transition: {
    faultId: 'hips_low_transition',
    name: 'Toe-rise kip swings to a target line',
    steps: [
      'Hang a band or mark a line at shoulder height in front of the bar.',
      'Kip and drive your toes up to the line with straight arms.',
      'Drop back into the swing; no turnover.',
    ],
    dose: '3 x 6',
    why: 'Reaching the target lifts the hips closer to the bar at the transition, where we measured them low.',
    draft: true,
  },
  chicken_wing: {
    faultId: 'chicken_wing',
    name: 'Banded bar muscle-up singles',
    steps: [
      'Loop a band over the bar and put a foot or knee in it.',
      'Do single reps with both elbows going over the bar together.',
      'Swap your lead hand halfway through.',
    ],
    dose: '8 to 10 singles',
    why: 'The band takes off enough load to turn both elbows over at once, closing the gap we measured between them.',
    draft: true,
  },
  hspu_banana: {
    faultId: 'hspu_banana',
    name: 'Chest-to-wall hold + three-count negatives',
    steps: [
      'Walk up the wall facing it and hold 20 s, wrists, shoulders and hips stacked.',
      'Come down, then do 3 negatives from the top over a count of three, hips against the wall.',
    ],
    dose: '3 rounds',
    why: 'The hold teaches a stacked line and the negatives keep it under load, the hip distance off the wall we measured.',
    draft: true,
  },
  hspu_kip_timing: {
    faultId: 'hspu_kip_timing',
    name: 'Headstand tuck-and-kick on the wall',
    steps: [
      'Headstand on a mat, backside to the wall.',
      'Bring your knees down to your elbows, then kick to straight legs, no press.',
      'After the sets, do 3 slow negatives from the top.',
    ],
    dose: '3 x 5, then 3 negatives',
    why: 'A full tuck sets up the kick so the hips drive the rep, where we measured the knees stopping short above the hips.',
    draft: true,
  },
};

// The drill in the lifter's language (src/i18n/<lang>/drills.ts), English where a line has no key.
export function drillFor(faultId: string | undefined): Drill | undefined {
  const d = faultId ? DRILLS[faultId] : undefined;
  if (!d) return undefined;
  const tr = (field: string, english: string) => {
    const key = `drills.${d.faultId}.${field}`;
    return isKey(key) ? t(key) : english;
  };
  return {
    ...d,
    name: tr('name', d.name),
    steps: d.steps.map((s, i) => tr(`step${i + 1}`, s)),
    dose: tr('dose', d.dose),
    why: tr('why', d.why),
  };
}
