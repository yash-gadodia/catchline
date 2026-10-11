export type QuizAnswers = string[];
export type QuizQuestion = { title: string; options: string[] };

export const QUIZ_LENGTH = 4;

const MOVEMENTS = ['Snatch', 'Clean and jerk', 'Muscle-ups', 'Handstand push-ups'];

const FAULTS: Record<string, { noun: string; options: string[] }> = {
  Snatch: {
    noun: 'snatch',
    options: ['Bar swings out front', 'I miss behind', "Can't get under it", "Not sure, that's the problem"],
  },
  'Clean and jerk': {
    noun: 'clean and jerk',
    options: ['Bar swings out front', 'Slow under the bar', 'The jerk goes forward', "Not sure, that's the problem"],
  },
  'Muscle-ups': {
    noun: 'muscle-up',
    options: ["Can't get over the bar", 'Chicken wing on one side', 'No kip rhythm', "Not sure, that's the problem"],
  },
  'Handstand push-ups': {
    noun: 'HSPU',
    options: ['Falling off the wall', 'Stuck at the bottom', 'Kip is mistimed', "Not sure, that's the problem"],
  },
};

export function quizQuestion(index: number, answers: QuizAnswers): QuizQuestion {
  if (index === 0) return { title: 'What are you working on?', options: MOVEMENTS };
  if (index === 1) {
    const fault = FAULTS[answers[0] ?? ''] ?? FAULTS.Snatch;
    return { title: `Where does your ${fault.noun} go wrong?`, options: fault.options };
  }
  if (index === 2) return { title: 'How often do you train it?', options: ['Once a week', '2 to 3 times a week', '4 or more'] };
  return { title: 'Do you film your lifts?', options: ['Every session', 'Sometimes', 'Not yet'] };
}

// The movement the free analysis should be filmed for.
export function quizMovement(answers: QuizAnswers): string {
  return FAULTS[answers[0] ?? '']?.noun ?? 'snatch';
}
