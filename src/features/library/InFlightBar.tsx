import { Pressable, Text, View } from 'react-native';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import type { Job } from '../../data/pipeline';
import { overallProgress } from '../analysis/progress';
import { t } from '../../i18n';

// While the lift is still being tracked it has no row on the Lifts tab yet, so a lifter who hid the
// processing sheet would see nothing running: preparing the clip, then the passes on the phone
// (uploading is the 3.0 server path).
export function inFlight(job: Job | null): job is Job {
  return job?.status === 'preparing' || job?.status === 'analysing' || job?.status === 'uploading';
}

export function inFlightProgress(job: Job): number {
  if (job.status === 'preparing' || job.status === 'analysing') return overallProgress(job) ?? 0;
  return 0.8 + (job.total > 0 ? (job.sent / job.total) * 0.2 : 0);
}

export function inFlightMeta(job: Job): string {
  if (job.status === 'preparing') return t('analysis.processing.preparingPct', { pct: Math.round(job.prepared * 100) });
  if (job.status === 'analysing') return t('analysis.processing.trackingPct', { pct: Math.round(inFlightProgress(job) * 100) });
  return t('analysis.processing.uploadingPct', { pct: job.total > 0 ? Math.round((job.sent / job.total) * 100) : 0 });
}

export default function InFlightBar({ job, onOpen }: { job: Job | null; onOpen: () => void }) {
  if (!inFlight(job)) return null;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" testID="in-flight" style={{ backgroundColor: colors.bg }}>
      <View style={{ height: 2, backgroundColor: colors.hairline }}>
        <View testID="in-flight-progress" style={{ height: 2, width: `${Math.round(inFlightProgress(job) * 100)}%`, backgroundColor: colors.flare }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.gutter, paddingVertical: space.s2 }}>
        <Text style={{ color: colors.text, ...type.readout }}>
          {t('library.inFlight.title')}
        </Text>
        <Text style={{ color: colors.text2, ...type.readout }}>{inFlightMeta(job)}</Text>
      </View>
    </Pressable>
  );
}
