import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNoSwipeBack } from '../../src/lib/useNoSwipeBack';
import MarkScreen from '../../src/features/capture/MarkScreen';
import { findPlate } from '../../src/features/capture/plateFind';
import type { PlateMark } from '../../src/features/capture/plateMark';
import { useCapture, useCaptureHydrated } from '../../src/features/capture/store';
import { submitDraft } from '../../src/features/capture/submit';
import { deviceLiftInFlight } from '../../src/data/devicePipeline';
import { colors, space } from '../../src/design/tokens';
import { type } from '../../src/design/typography';
import { t } from '../../src/i18n';

// Between trimming and tracking (4.0.3 on): the plate is looked for on the first frame of the trimmed clip, and the
// lifter checks it, adjusts it, or skips for a lift with no plate. Tracking starts from what they leave.
const LOOK_AT_S = [0, 0.5, 1];
export default function PlateRoute() {
  const router = useRouter();
  const { draft, updateDraft } = useCapture();
  const ready = useCaptureHydrated();
  const uri = draft?.uri ?? null;
  const at = draft?.trim.start ?? 0;
  const end = draft?.trim.end ?? 0;
  // where the plate was found: how far into the trimmed clip (the first frame, else a little later, since a lifter
  // still walking to the bar has no plate in their hands yet), and the plate; null mark when none was
  const [found, setFound] = useState<{ atS: number; mark: PlateMark | null } | null>(null);
  useNoSwipeBack();
  useEffect(() => {
    if (!ready) return;
    // no clip to look at (the dev sample), or the phone is still tracking another lift with the same models
    if (!uri || deviceLiftInFlight()) {
      submitDraft({ replace: true });
      return;
    }
    let live = true;
    (async () => {
      for (const atS of LOOK_AT_S) {
        if (atS > 0 && at + atS >= end) break;
        const mark = await findPlate(uri, at + atS);
        if (!live) return;
        if (mark) return setFound({ atS, mark });
      }
      setFound({ atS: 0, mark: null });
    })();
    return () => {
      live = false;
    };
  }, [ready, uri, at, end]);
  if (!draft || !ready || !uri || !found) {
    return (
      <View testID="plate-finding" style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
        <ActivityIndicator color={colors.text} />
        <Text style={{ ...type.callout, color: colors.text2 }}>{t('capture.mark.finding')}</Text>
      </View>
    );
  }
  const track = (plateMark: PlateMark | null) => {
    updateDraft({ plateMark: plateMark && found.atS > 0 ? { ...plateMark, atS: found.atS } : plateMark });
    submitDraft({ replace: true });
  };
  return <MarkScreen uri={uri} at={at + found.atS} initial={found.mark} onBack={() => router.back()} onTrack={track} onSkip={() => track(null)} />;
}
