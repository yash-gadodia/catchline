import { t, type Key } from '../../i18n';

export type QuizAnswers = string[];
export type QuizQuestion = { title: string; options: string[] };

export const QUIZ_LENGTH = 4;

const MOVEMENTS = ['Snatch', 'Clean and jerk', 'Muscle-ups'];

// Options are stored and matched in English; quizOptionLabel shows them in the lifter's language.
const FAULTS: Record<string, { noun: string; title: Key; options: string[] }> = {
  Snatch: {
    noun: 'snatch',
    title: 'paywall.quiz.wrongSnatch',
    options: ['Bar swings out front', 'I miss behind', "Can't get under it", "Not sure, that's the problem"],
  },
  'Clean and jerk': {
    noun: 'clean and jerk',
    title: 'paywall.quiz.wrongCleanJerk',
    options: ['Bar swings out front', 'Slow under the bar', 'The jerk goes forward', "Not sure, that's the problem"],
  },
  'Muscle-ups': {
    noun: 'muscle-up',
    title: 'paywall.quiz.wrongMuscleUp',
    options: ["Can't get over the bar", 'Chicken wing on one side', 'No kip rhythm', "Not sure, that's the problem"],
  },
  'Handstand push-ups': {
    noun: 'HSPU',
    title: 'paywall.quiz.wrongHspu',
    options: ['Falling off the wall', 'Stuck at the bottom', 'Kip is mistimed', "Not sure, that's the problem"],
  },
};

export function quizQuestion(index: number, answers: QuizAnswers): QuizQuestion {
  if (index === 0) return { title: t('paywall.quiz.working'), options: MOVEMENTS };
  if (index === 1) {
    const fault = FAULTS[answers[0] ?? ''] ?? FAULTS.Snatch;
    return { title: t(fault.title), options: fault.options };
  }
  if (index === 2) return { title: t('paywall.quiz.often'), options: ['Once a week', '2 to 3 times a week', '4 or more'] };
  return { title: t('paywall.quiz.film'), options: ['Every session', 'Sometimes', 'Not yet'] };
}

// The movement the free analysis should be filmed for.
export function quizMovement(answers: QuizAnswers): string {
  return FAULTS[answers[0] ?? '']?.noun ?? 'snatch';
}

const OPTION_KEY: Record<string, Key> = {
  Snatch: 'paywall.quiz.opt.snatch',
  'Clean and jerk': 'paywall.quiz.opt.cleanJerk',
  'Muscle-ups': 'paywall.quiz.opt.muscleUps',
  'Handstand push-ups': 'paywall.quiz.opt.hspu',
  'Bar swings out front': 'paywall.quiz.opt.swingsFront',
  'I miss behind': 'paywall.quiz.opt.missBehind',
  "Can't get under it": 'paywall.quiz.opt.cantGetUnder',
  "Not sure, that's the problem": 'paywall.quiz.opt.notSure',
  'Slow under the bar': 'paywall.quiz.opt.slowUnder',
  'The jerk goes forward': 'paywall.quiz.opt.jerkForward',
  "Can't get over the bar": 'paywall.quiz.opt.cantGetOver',
  'Chicken wing on one side': 'paywall.quiz.opt.chickenWing',
  'No kip rhythm': 'paywall.quiz.opt.noKipRhythm',
  'Falling off the wall': 'paywall.quiz.opt.fallingOff',
  'Stuck at the bottom': 'paywall.quiz.opt.stuckBottom',
  'Kip is mistimed': 'paywall.quiz.opt.kipMistimed',
  'Once a week': 'paywall.quiz.opt.onceWeek',
  '2 to 3 times a week': 'paywall.quiz.opt.twoThree',
  '4 or more': 'paywall.quiz.opt.fourPlus',
  'Every session': 'paywall.quiz.opt.everySession',
  Sometimes: 'paywall.quiz.opt.sometimes',
  'Not yet': 'paywall.quiz.opt.notYet',
};

export function quizOptionLabel(option: string): string {
  const key = OPTION_KEY[option];
  return key ? t(key) : option;
}
