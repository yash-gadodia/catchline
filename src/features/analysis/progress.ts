import type { Job } from '../../data/pipeline';

// One number for the whole wait: preparing the clip is the first tenth, tracking the rest, so the figure never
// runs to 89% on the clip and then starts again.
const PREPARE_SHARE = 0.1;
export function overallProgress(job: Job | null): number | null {
  if (!job) return null;
  if (job.status === 'preparing') return PREPARE_SHARE * (job.prepared ?? 0);
  if (job.status === 'analysing') return PREPARE_SHARE + (1 - PREPARE_SHARE) * (job.fraction ?? 0);
  if (job.status === 'done') return 1;
  return null;
}
