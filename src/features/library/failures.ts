import type { Failure } from '../../analysis/types';

export type FailureReason = Failure['reason'];

export type FailureAction = 'retake' | 'import' | 'keep' | 'partial' | 'pickA' | 'pickB' | 'reanalyse' | 'later' | 'label';

export type FailureCopy = {
  kicker: string;
  title: string;
  body: string;
  primary: { label: string; action: FailureAction; outline?: boolean };
  alt?: { label: string; action: FailureAction };
  links: [{ label: string; action: FailureAction }, { label: string; action: FailureAction }];
  readout: string;
  image: string;
};

// One layout for every failure so the lifter learns it once: the frame where it
// failed with the problem marked, one-line cause, one fix, and the clip is kept.
export const FAILURE_COPY: Record<FailureReason, FailureCopy> = {
  bar_out_of_frame: {
    kicker: "Couldn't analyse",
    title: 'The bar went out the top of the frame',
    body: "I lost it above your head, so I can't see the catch. Tilt the phone up a touch or step back a metre.",
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Keep the clip anyway', action: 'keep' },
    ],
    readout: 'bar leaves the frame here',
    image: 'asset:snatch/4-extension',
  },
  not_side_on: {
    kicker: "Couldn't analyse",
    title: 'The camera is in front of you, not beside',
    body: "From here the bar looks like it drifts when it doesn't. Put the phone level with the bar, square to your side.",
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Keep the clip anyway', action: 'keep' },
    ],
    readout: 'bar should be a flat line',
    image: 'asset:snatch/1-setup',
  },
  too_dark: {
    kicker: "Couldn't analyse",
    title: 'Too dark to track the bar',
    body: 'The plates and the floor are the same shade. Face a light, or film with the window behind the phone, not behind you.',
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Keep the clip anyway', action: 'keep' },
    ],
    readout: "can't separate you from the floor",
    image: 'asset:snatch/2-knee',
  },
  too_far: {
    kicker: "Couldn't analyse",
    title: 'Too far away to measure',
    body: 'A centimetre of bar drift is less than a pixel from here. Three to four metres is the sweet spot.',
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Keep the clip anyway', action: 'keep' },
    ],
    readout: 'you are 90 px tall · need 300+',
    image: 'asset:snatch/1-setup',
  },
  too_shaky: {
    kicker: "Couldn't analyse",
    title: 'The phone was moving',
    body: "Handheld shake looks exactly like bar drift. Lean it on a plate or a water bottle and it'll be fine.",
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Keep the clip anyway', action: 'keep' },
    ],
    readout: 'the wall moved 14 px during the lift',
    image: 'asset:snatch/3-hip',
  },
  multiple_lifters: {
    kicker: 'One more thing',
    title: 'Two people lifting. Which one is you?',
    body: "I'll track the one you pick and blur the other.",
    primary: { label: 'A, in white', action: 'pickA' },
    alt: { label: 'B, in black', action: 'pickB' },
    links: [
      { label: 'Retake alone', action: 'retake' },
      { label: 'Try a different clip', action: 'import' },
    ],
    readout: 'A',
    image: 'asset:snatch/1-setup',
  },
  clip_cut_off: {
    kicker: "Couldn't analyse",
    title: 'The clip stops before the catch',
    body: 'I can see the pull but not where the bar ended up, and the catch is where most cues live. Let it run a second past the lockout.',
    primary: { label: 'Retake', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Analyse the pull only', action: 'partial' },
    ],
    readout: 'clip ends\nhere',
    image: 'asset:snatch/5-turnover',
  },
  unsupported_movement: {
    kicker: 'Not yet',
    title: "I don't know this movement yet",
    body: "Right now: snatch, clean, jerk, kipping pull-up, bar muscle-up, kipping handstand push-up. Ring muscle-up isn't supported yet. Tell me what this is and it goes on the list. The clip stays in your library.",
    primary: { label: "It's a wall walk", action: 'label', outline: true },
    links: [
      { label: "It's one of the supported lifts", action: 'reanalyse' },
      { label: 'Keep the clip', action: 'keep' },
    ],
    readout: 'looks like: wall walk · not yet supported',
    image: 'library:hs-2',
  },
  low_frame_rate: {
    kicker: "Couldn't analyse timing",
    title: '24 frames a second is too slow for a snatch',
    body: "The second pull is a tenth of a second; at 24 fps that's two frames. I can still draw the path, but not time the phases. Film in Catchline or set your camera to 60.",
    primary: { label: 'Retake at 60 fps', action: 'retake' },
    links: [
      { label: 'Try a different clip', action: 'import' },
      { label: 'Path only, no timing', action: 'partial' },
    ],
    readout: 'frame 61 → 62 · the whole second pull happened in between',
    image: 'asset:snatch/3-hip',
  },
  unknown: {
    kicker: "That one's on us",
    title: 'Something broke on our side',
    body: "Your clip is fine and it's saved. Try again now, or leave it and we'll retry in the background. This didn't use one of your videos.",
    primary: { label: 'Try again', action: 'reanalyse' },
    links: [
      { label: 'Retry later', action: 'later' },
      { label: 'ref', action: 'later' },
    ],
    readout: '',
    image: 'asset:snatch/6-catch',
  },
};

export const FAILURE_REASONS = Object.keys(FAILURE_COPY) as FailureReason[];
