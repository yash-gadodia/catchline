import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import ProcessingSheet, { type ProcessingState } from '../../src/features/analysis/ProcessingSheet';
import { registerPushToken } from '../../src/features/notifications';

const STEP_MS = 1100;
const LONG_WAIT_S = 45;

type Params = { fixture?: string; state?: ProcessingState; step?: string; elapsed?: string };

export default function ProcessingRoute() {
  const params = useLocalSearchParams<Params>();
  return <Processing key={JSON.stringify(params)} params={params} />;
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
