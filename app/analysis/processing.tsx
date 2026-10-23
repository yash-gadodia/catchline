import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { putLiveAnalysis } from '../../src/analysis/live';
import { useAnalysis } from '../../src/analysis/useAnalysis';
import type { Analysis, Failure } from '../../src/analysis/types';
import ProcessingSheet, { EXPECTED_ANALYSIS_S, type ProcessingState } from '../../src/features/analysis/ProcessingSheet';
import { registerPushToken } from '../../src/features/notifications';
import { noteAnalysisFinished } from '../../src/features/notifications/ask';
import { useUsage } from '../../src/features/paywall/usageStore';
import { syncServerUsage } from '../../src/features/paywall/hooks';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import { syncLibrary } from '../../src/data/library';
import { usePipeline, type Job, type JobStatus } from '../../src/data/pipeline';
import { cancelDeviceLift } from '../../src/data/devicePipeline';
import { submitDraft } from '../../src/features/capture/submit';
import { t } from '../../src/i18n';

const STEP_MS = 1100;
const LONG_WAIT_MARGIN_S = 30;
const LONG_WAIT_S = EXPECTED_ANALYSIS_S + LONG_WAIT_MARGIN_S;

type Params = { fixture?: string; state?: ProcessingState; step?: string; elapsed?: string; count?: string; live?: string; retest?: string };

export default function ProcessingRoute() {
  const params = useLocalSearchParams<Params>();
  if (params.live === '1') return <LiveProcessing />;
  return <Processing key={JSON.stringify(params)} params={params} />;
}

// The first step's meta, in the lifter's language.
function uploadMeta(job: Job | null): string | null {
  if (job?.status === 'preparing') return t('analysis.processing.preparingPct', { pct: Math.round(job.prepared * 100) });
  if (job?.status === 'analysing') return t('analysis.processing.analysingPct', { pct: Math.round((job.fraction ?? 0) * 100) });
  return null;
}

function retestParams(fixture: string, retest: string | undefined): Record<string, string> {
  return retest ? { fixture, retest } : { fixture };
}

function recordUsage() {
  useUsage.getState().record(usePurchases.getState().tier, new Date());
}

function Processing({ params }: { params: Params }) {
  const router = useRouter();
  const load = useAnalysis(params.fixture);
  const analysis = load.status === 'ready' ? load.analysis : null;
  const fixed = params.state;
  const [step, setStep] = useState(Number(params.step ?? 0));
  const [elapsed, setElapsed] = useState(Number(params.elapsed ?? 0));
  const [waiting, setWaiting] = useState(false);

  // Nothing to play: no fixture in a release build. Home, never the demo.
  useEffect(() => {
    if (load.status === 'missing') router.replace('/');
  }, [load.status]);

  useEffect(() => {
    if (fixed) return;
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    const stepper = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => {
      clearInterval(tick);
      clearInterval(stepper);
    };
  }, [fixed]);

  const live: ProcessingState = step >= 5 ? 'done' : elapsed > LONG_WAIT_S && !waiting ? 'long' : 'progress';
  const counted = useRef(false);
  useEffect(() => {
    if (params.count !== '1' || live !== 'done' || counted.current) return;
    counted.current = true;
    recordUsage();
  }, [live, params.count]);

  return (
    <ProcessingSheet
      analysis={analysis}
      state={fixed ?? live}
      step={step}
      elapsed={elapsed}
      onHide={() => router.back()}
      onNotify={async () => {
        await registerPushToken(true);
        router.back();
      }}
      onKeepWaiting={() => setWaiting(true)}
      onSee={() => analysis && router.replace({ pathname: '/analysis/reveal', params: retestParams(analysis.id, params.retest) })}
    />
  );
}

const STEP_FOR: Record<JobStatus, number> = { preparing: 0, uploading: 0, analysing: 1, queued: 1, processing: 2, done: 4, failed: 4 };

// On the phone the steps follow the native run: the four after "preparing" share its progress.
function deviceStep(job: Job): number {
  if (job.status === 'preparing') return 0;
  if (job.status !== 'analysing') return STEP_FOR[job.status];
  return 1 + Math.min(3, Math.floor((job.fraction ?? 0) * 4));
}

// A real lift (3.1): analysed on the phone, so the job carries its progress and then the
// result. Nothing is uploaded and nothing arrives over the network.
function LiveProcessing() {
  const router = useRouter();
  const job = usePipeline((s) => s.job);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // The clock counts from when this lift was started (the job id is its start time), so reopening keeps it.
  const startedAt = job ? Number(job.id.replace('job-', '')) || null : null;
  const since = () => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
  const [elapsed, setElapsed] = useState(since);
  // Leaving lands on the Lifts tab, never back on the review of the clip already analysed.
  const home = () => router.dismissTo('/');
  const fail = (id: string, reason: Failure['reason'], native?: string) =>
    router.replace({ pathname: '/failure/[id]', params: native ? { id, reason, native } : { id, reason } });

  useEffect(() => {
    const tick = setInterval(() => setElapsed((e) => (startedAt ? since() : e + 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!job || job.status !== 'failed') return;
    if (job.error === 'clip_too_long' || job.error === 'models_unavailable') return;
    if (job.error === 'cancelled') return home();
    if (job.error === 'analysis_failed') return fail(job.liftId ?? job.id, job.result?.failure?.reason ?? job.failureReason ?? 'unknown', job.failureDetail);
    fail(job.id, 'unknown');
  }, [job?.status]);

  useEffect(() => {
    if (job?.status !== 'done' || !job.result) return;
    putLiveAnalysis(job.result);
    if (!job.result.failure) noteAnalysisFinished();
    void syncServerUsage();
    syncLibrary().catch(() => undefined);
    setAnalysis(job.result);
  }, [job?.status]);

  const step = analysis ? 5 : job ? deviceStep(job) : 0;
  const tooLong = job?.error === 'clip_too_long';
  const offline = job?.error === 'models_unavailable';
  const state: ProcessingState = tooLong ? 'too_long' : offline ? 'offline' : analysis ? 'done' : 'progress';

  return (
    <ProcessingSheet
      analysis={analysis}
      clipUri={job?.uri ?? null}
      meta={uploadMeta(job) ?? `${elapsed} s`}
      firstStep={job?.status === 'preparing' ? t('analysis.processing.preparingClip') : t('analysis.processing.analysingOnPhone')}
      maxS={job?.maxS ?? undefined}
      state={state}
      step={step}
      elapsed={elapsed}
      onHide={home}
      onCancel={analysis ? undefined : () => {
        cancelDeviceLift();
        home();
      }}
      onNotify={home}
      onKeepWaiting={home}
      onSee={() => analysis && router.replace({ pathname: '/analysis/reveal', params: retestParams(analysis.id, job?.retestCueId) })}
      onTrim={() => router.replace('/capture/trim')}
      onRetry={() => {
        if (!submitDraft({ replace: true })) home();
      }}
    />
  );
}
