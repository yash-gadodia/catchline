import { Text, View } from 'react-native';
import { ANALYSES } from '../../analysis/fixtures';
import { liveAnalysis } from '../../analysis/live';
import type { Analysis } from '../../analysis/types';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { metricFor } from '../library/metrics';
import { useLibrary } from '../library/repository';
import { cleanStreak, liftOfAnalysis, previousValue, retestVerdict, RETESTS_TO_STICK, type Verdict } from '../library/retest';
import type { CueRecord } from '../library/types';
import { Underlined } from '../library/ui';
import { t } from '../../i18n';
import { cueText } from '../../i18n/cues';

export type Retest = { cue: CueRecord; verdict: Verdict; streak: number };

const analysisFor = (id: string) => liveAnalysis(id) ?? ANALYSES[id];

// The cue this result tested: the one the capture carried (route param), else the one its lift names.
export function useRetest(analysis: Analysis, retestCueId?: string): Retest | null {
  const { cues, lifts, sessions } = useLibrary();
  const lift = liftOfAnalysis(analysis.id, lifts);
  const id = retestCueId ?? lift?.retestCueId;
  const cue = id ? cues.find((c) => c.id === id) : undefined;
  if (!cue) return null;
  const verdict = retestVerdict(cue.metricId, previousValue(cue, sessions, lifts, lift), analysis);
  return { cue, verdict, streak: cleanStreak(cue, lifts, analysisFor, analysis) };
}

// The cue to film next from this result: the one it tested, else the lifter's trying cue for its headline fault.
export function useRetestable(analysis: Analysis, retestCueId?: string): CueRecord | undefined {
  const { cues, lifts } = useLibrary();
  const id = retestCueId ?? liftOfAnalysis(analysis.id, lifts)?.retestCueId;
  const trying = cues.filter((c) => c.status === 'trying');
  return (
    trying.find((c) => c.id === id) ??
    trying.find((c) => c.movement === analysis.movement && c.metricId === analysis.cue?.faultId)
  );
}

// The first block of a retest's result: the tested cue's number before and now.
export default function RetestVerdict({ retest, onStuck }: { retest: Retest; onStuck?: (cueId: string) => void }) {
  const { cue, verdict, streak } = retest;
  const stuck = streak >= RETESTS_TO_STICK && cue.status === 'trying';
  return (
    <View testID="retest-verdict" style={{ gap: space.s2, paddingBottom: space.s4, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
      <SmallCaps>{t('analysis.retest.label', { cue: cueText(cue.metricId, cue.text) })}</SmallCaps>
      <Text testID="retest-verdict-text" style={{ ...type.title, color: colors.text }}>
        {verdict.text}
      </Text>
      {stuck ? (
        <>
          <Text testID="retest-streak" style={{ ...type.callout, color: colors.text2 }}>
            {t('analysis.retest.streak', { metric: metricFor(cue.metricId).label, count: streak })}
          </Text>
          {onStuck ? (
            <Underlined onPress={() => onStuck(cue.id)} testID="retest-stuck">
              {t('analysis.retest.itStuck')}
            </Underlined>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
