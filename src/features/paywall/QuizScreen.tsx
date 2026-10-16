import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { selection } from '../../lib/haptics';
import { t } from '../../i18n';
import { QUIZ_LENGTH, quizOptionLabel, quizQuestion, type QuizAnswers } from './quiz';
import { OptionCard } from './ui';

// Ad-traffic funnel step 1: four taps that set up the one free analysis.
export default function QuizScreen({
  initialStep = 0,
  initialAnswers = [],
  onDone,
}: {
  initialStep?: number;
  initialAnswers?: QuizAnswers;
  onDone: (answers: QuizAnswers) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(initialStep);
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers);
  const q = quizQuestion(step, answers);
  const picked = answers[step];

  const pick = (option: string) => {
    selection();
    setAnswers([...answers.slice(0, step), option]);
  };
  const next = () => {
    if (!picked) return;
    if (step === QUIZ_LENGTH - 1) onDone(answers);
    else setStep(step + 1);
  };

  return (
    <View
      testID="quiz"
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space.s6,
        paddingBottom: insets.bottom + space.s5,
        paddingHorizontal: space.gutter,
      }}
    >
      <SmallCaps>{t('paywall.quiz.step', { step: step + 1, total: QUIZ_LENGTH })}</SmallCaps>
      <Text style={[display(34), { color: colors.text, marginTop: space.s3, marginBottom: space.s4 }]}>{q.title}</Text>
      <View style={{ gap: space.s2 }}>
        {q.options.map((o) => (
          <OptionCard key={o} selected={picked === o} onPress={() => pick(o)} testID={`option-${o}`}>
            <Text style={{ color: colors.text, ...type.label, fontFamily: fontFamily.body }}>{quizOptionLabel(o)}</Text>
          </OptionCard>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Btn onPress={next} testID="quiz-next" style={{ opacity: picked ? 1 : 0.4 }}>
        {t('paywall.quiz.next')}
      </Btn>
    </View>
  );
}
