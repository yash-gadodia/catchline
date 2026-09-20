import type { SlotKey } from '../domain/scaffold';
// Parallax Refocus: two honest modes.
// SOLO — untangle your side of a rough moment. The AI only ever sees the
// user's own words; it never invents or speaks for the partner.
// TWO-SIDED (4.6) — both partners add their REAL side to a persisted session;
// the AI mediates only once both sides exist (shared ground, each side's
// underneath, one kind bridge each). It never invents a side.
// Both modes run the safety screening stack first (see the edge function).

// ── RESULT SHAPES ───────────────────────────────────────────────

export interface RefocusResult {
  happened: string[];
  angles: string[];
  underneath: string;
  wayback: string;
  bridge: string;
  // Set by the edge fn when the safety screening pass could not run (API
  // error): reflection proceeded, and the client appends the resources note.
  screening_unavailable?: boolean;
}

// The two-sided mediation, stored verbatim in refocus_sessions.ai_result so
// both partners render the SAME result.
export interface RefocusMediation {
  type: 'mediation';
  shared_ground: string;
  initiator_underneath: string;
  partner_underneath: string;
  initiator_bridge: string;
  partner_bridge: string;
  screening_unavailable?: boolean;
}

export interface RefocusHelpline {
  name: string;
  contact: string;
}

// Crisis / abuse-signal responses are static server copy (never
// LLM-improvised) — the client only renders what the server sent.
export interface RefocusSafety {
  type: 'crisis' | 'abuse';
  title: string;
  message: string;
  helplines: RefocusHelpline[];
}

export type RefocusAiResult = RefocusMediation | RefocusSafety;

// ── ONE SIDE (v2 solo) ────────────────────────────────────────────
// The pivot: one person, one account, three inseparable outputs, or a
// first-class "there is no bridge here". Shape mirrors the edge fn's
// handleSoloV2 exactly; the server normalizes (a no_bridge read never
// carries a bridge string).

export interface RefocusReadV2 {
  schema: 'v2';
  bridge_decision: 'bridge' | 'no_bridge';
  underneath: string;
  not_wrong_about: string;
  bridge: string;
  no_bridge: { noticed: string; let_go: string } | null;
  screening_unavailable?: boolean;
}

// Test-build flag: the app opens straight into capture, the couples flow
// stays reachable in code but off the path. Flip to false to restore v2.0.x.
export const ONE_SIDE: boolean = true;

export const CAPTURE_COPY = {
  question: 'What happened?',
  firstLine: 'Say it or type it. It stays yours.',
  placeholder: 'Fragments are fine.',
  justSave: 'Just save',
  readIt: 'Read it',
  pasteChat: 'Paste the chat',
  addScreenshot: 'Add a screenshot',
  readingScreenshot: 'Reading the screenshot…',
  screenshotMiss: "Couldn't read a chat in that screenshot. Try a clearer one, or paste the text.",
  chatConsent:
    'Their words go with yours when you tap Read it. Only what you pasted, nothing else.',
  savedAnnounce: 'Saved on this phone. Nothing sent.',
};

// Sentence stems on the keyboard accessory row: a speed affordance for
// starting, not an information channel (PRD §0 — prose is primary).
export const STEMS = [
  'She said ',
  'I let it go when ',
  'The second time I ',
  'I felt like the one who ',
];

export const WORKING_STAGES = [
  'Hearing you',
  "Finding what's underneath",
  'Looking for a bridge',
];
export const WORKING_CONSIDERED = 'A considered answer, not a fast one.';

export const READ_COPY = {
  eyebrow: 'One sentence you could send',
  underneathHead: 'Underneath it for you',
  notWrongHead: "What they're probably not wrong about",
  editHint: 'Tap the sentence to make it yours.',
  editedHint: 'Yours now.',
  useAsIs: 'Use it as is',
  copy: 'Copy',
  copied: 'Copied',
  regenerate: "This isn't right, read it once more",
  done: 'Done',
};

export const NO_BRIDGE_COPY = {
  eyebrow: 'Tonight · read once',
  headline: 'There is no bridge here.',
  letGoLead: 'The honest thing is to let this one go.',
  nothingToSend: 'Nothing to send.',
};

export type RefocusSessionState =
  | 'waiting_partner'
  | 'ready'
  | 'revealed'
  | 'expired';

// ── DISCLOSURE COPY (every AI result carries both lines) ─────────

export const AI_DISCLOSURE = 'Written by AI, and it reads like it cares, but it isn\'t a person.';

export const THERAPY_DISCLAIMER =
  'Refocus helps you talk it through, it isn\'t therapy. For the heavy stuff, please reach for a real pro. 🤍';

// Shown when the safety screening pass failed (API error) and we proceeded
// anyway — the honest fallback for the fail-open tradeoff.
export const SCREENING_UNAVAILABLE_NOTE =
  'Our safety check couldn\'t run this time. If anything here touches on safety or crisis, please reach a human: SOS 1767 (SG) or findahelpline.com.';

// ── INTRO PROMISES (displayed at the start) ────────────────────────

export interface RefocusPromise {
  iconId: string;
  title: string;
  desc: string;
}

export const PROMISES: RefocusPromise[] = [
  {
    iconId: 'lock',
    title: 'Your raw words stay yours',
    desc: 'Only the AI reads them. Together mode shares the middle ground, never your words.',
  },
  {
    iconId: 'us',
    title: 'No sides taken',
    desc: 'What\'s underneath for each of you, no judgement, no verdicts.',
  },
  {
    iconId: 'heart',
    title: 'A kind way to raise it',
    desc: 'It ends with words you could actually say, if you choose to.',
  },
];

// ── INPUT MODES (text, paste) ────────────────────────────────────

export type RefocusMode = 'text' | 'paste';

export interface RefocusModeOption {
  id: RefocusMode;
  emoji: string;
  label: string;
  desc: string;
}

export const MODES: RefocusModeOption[] = [
  {
    id: 'text',
    emoji: '✍️',
    label: 'Type it out',
    desc: 'Say what happened in your own words',
  },
  {
    id: 'paste',
    emoji: '💬',
    label: 'Paste your texts',
    desc: 'Drop the actual conversation in',
  },
];

export type HeatLevel = 'simmering' | 'heated' | 'boiling';

export interface HeatOption {
  id: HeatLevel;
  emoji: string;
  label: string;
  desc: string;
}

// Asked before either partner writes a word. Mediating a fight that is still
// burning does not calm it, it gives it a transcript — 'boiling' routes to a
// real pause first.
export const HEAT_LEVELS: HeatOption[] = [
  {
    id: 'simmering',
    emoji: '🌤️',
    label: 'Simmering',
    desc: "It's bothering me, but I'm calm",
  },
  {
    id: 'heated',
    emoji: '🌡️',
    label: 'Heated',
    desc: 'We went a few rounds on this',
  },
  {
    id: 'boiling',
    emoji: '🔥',
    label: 'Boiling',
    desc: "I'm still shaking a bit",
  },
];

// One tap, optional. Feeds the couple's memory so patterns can surface later.
export const TOPIC_TAGS = [
  'chores',
  'money',
  'family',
  'tone',
  'plans',
  'time together',
] as const;

export const COOL_DOWN = {
  title: 'Let it cool first.',
  body: "You're still in it. Anything written right now comes out sharper than you mean, and the mediator would just be handing that to them in nicer words.",
  ask: 'Give it twenty minutes. Walk, water, shower, anything that is not this. We will hold your place.',
  primary: "I've cooled off",
  secondary: 'Come back to this later',
};

// ── Scaffold slots (v3 write step) ───────────────────────────────
// Tapping chips is a complete input on its own: a flooded person should be able
// to reach an output having typed nothing. Every sheet also takes free text.
export const SLOT_LABELS: Record<SlotKey, string> = {
  they: 'They',
  i: 'Then I',
  then: 'Then',
  hear: 'I wanted them to say',
};

export const SLOT_PLACEHOLDERS: Record<SlotKey, string> = {
  they: 'did what',
  i: 'did what',
  then: 'what happened',
  hear: 'what',
};

export const SLOT_OPTIONS: Record<SlotKey, string[]> = {
  they: [
    'made a plan without checking',
    'went quiet on me',
    'brought up my family',
    'raised their voice',
    'left',
  ],
  i: [
    'brought their family into it',
    "said something I don't mean",
    'went quiet',
    'raised my voice',
    'left the room',
    'kept score out loud',
  ],
  then: [
    'they went quiet and left',
    'silence all evening',
    'we both slept on it',
    'it got louder',
  ],
  hear: [
    'that it mattered to them too',
    'sorry, plainly',
    'nothing, just quiet',
    "that they'd noticed",
  ],
};
