import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import { putLiveAnalysis } from '../../src/analysis/live';
import type { Analysis, Failure } from '../../src/analysis/types';
import ProcessingSheet, { type ProcessingState } from '../../src/features/analysis/ProcessingSheet';
import { registerPushToken } from '../../src/features/notifications';
import { useUsage } from '../../src/features/paywall/usageStore';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import { subscribeToLift } from '../../src/lib/api';
import { syncLibrary } from '../../src/data/library';
import { usePipeline, type JobStatus } from '../../src/data/pipeline';

const STEP_MS = 1100;
const CRAWL_MS = 4000;
const LONG_WAIT_S = 45;

type Params = { fixture?: string; state?: ProcessingState; step?: string; elapsed?: string; count?: string; live?: string };

export default function ProcessingRoute() {
  const params = useLocalSearchParams<Params>();
  if (params.live === '1') return <LiveProcessing />;
  return <Processing key={JSON.stringify(params)} params={params} />;
}

function recordUsage() {
  useUsage.getState().record(usePurchases.getState().tier, new Date());
}

function Processing({ params }: { params: Params }) {
  const router = useRouter();
  const analysis = getAnalysis(params.fixture);
  const fixed = params.state;
  const [step, setStep] = useState(Number(params.step ?? 0));
  const [elapsed, setElapsed] = useState(Number(params.elapsed ?? 0));
  const [waiting, setWaiting] = useState(false);

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
      onNotify={() => {
        registerPushToken(true);
        router.back();
      }}
      onKeepWaiting={() => setWaiting(true)}
      onSee={() => router.replace({ pathname: '/analysis/reveal', params: { fixture: analysis.id } })}
    />
  );
}

const STEP_FOR: Record<JobStatus, number> = { uploading: 0, queued: 1, processing: 2, done: 4, failed: 4 };

// A real lift: upload progress from the pipeline job, then the lift row over
// Realtime until the worker writes the Analysis.
function LiveProcessing() {
  const router = useRouter();
  const job = usePipeline((s) => s.job);
  const liftId = job?.liftId ?? null;
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [crawl, setCrawl] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const current = status ?? job?.status ?? 'uploading';

  const fail = (id: string, reason: Failure['reason']) =>
    router.replace({ pathname: '/failure/[id]', params: { id, reason } });

  useEffect(() => {
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    const crawler = setInterval(() => setCrawl((c) => Math.min(c + 1, 2)), CRAWL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(crawler);
    };
  }, []);

  useEffect(() => {
    if (!job || job.status !== 'failed') return;
    if (job.error === 'cap_reached') router.replace({ pathname: '/paywall', params: { clip: job.id, movement: job.movement } });
    else fail(job.id, 'unknown');
  }, [job?.status]);

  useEffect(() => {
    if (!liftId) return;
    return subscribeToLift(liftId, {
      onLift: (lift) => setStatus(lift.status as JobStatus),
      onAnalysis: (a, lift) => {
        if (!a || a.failure || lift.status === 'failed') {
          fail(lift.id, a?.failure?.reason ?? 'unknown');
          return;
        }
        putLiveAnalysis(a);
        recordUsage();
        syncLibrary().catch(() => undefined);
        setAnalysis(a);
      },
      onError: () => fail(liftId, 'unknown'),
    });
  }, [liftId]);

  const step = analysis ? 5 : STEP_FOR[current] + (current === 'processing' ? crawl : 0);
  const state: ProcessingState = analysis ? 'done' : elapsed > LONG_WAIT_S && !waiting ? 'long' : 'progress';
  const meta =
    current === 'uploading' && job && job.total > 0 ? `uploading ${Math.round((job.sent / job.total) * 100)}%` : `${elapsed} s`;

  return (
    <ProcessingSheet
      analysis={analysis}
      meta={meta}
      state={state}
      step={step}
      elapsed={elapsed}
      onHide={() => router.back()}
      onNotify={() => {
        registerPushToken(true);
        router.back();
      }}
      onKeepWaiting={() => setWaiting(true)}
      onSee={() => analysis && router.replace({ pathname: '/analysis/reveal', params: { fixture: analysis.id } })}
    />
  );
}
