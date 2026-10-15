import { useEffect, useState } from 'react';

// The first-run demo: the real result screens on the owner's own snatch, played
// back on a timer. No upload, no lift, no usage counted.
export type DemoStep = 'processing' | 'reveal' | 'cue' | 'player' | 'end';

export const DEMO_STEPS: { step: Exclude<DemoStep, 'end'>; ms: number; caption: string }[] = [
  { step: 'processing', ms: 5000, caption: 'Catchline finds the bar' },
  { step: 'reveal', ms: 4500, caption: 'Catchline finds the bar' },
  { step: 'cue', ms: 4500, caption: 'One thing to fix' },
  { step: 'player', ms: 6000, caption: 'Scrub any frame' },
];

// The processing sheet's step list ticks this often, then shows "done".
export const PROCESSING_TICK_MS = 800;

export function nextDemoStep(step: DemoStep): DemoStep {
  const i = DEMO_STEPS.findIndex((s) => s.step === step);
  return i < 0 || i === DEMO_STEPS.length - 1 ? 'end' : DEMO_STEPS[i + 1].step;
}

export function demoCaption(step: DemoStep): string | null {
  return DEMO_STEPS.find((s) => s.step === step)?.caption ?? null;
}

export function demoDuration(step: DemoStep): number | null {
  return DEMO_STEPS.find((s) => s.step === step)?.ms ?? null;
}

export function useDemo(start: DemoStep = 'processing') {
  const [step, setStep] = useState<DemoStep>(start);
  useEffect(() => {
    const ms = demoDuration(step);
    if (ms === null) return;
    const timer = setTimeout(() => setStep(nextDemoStep(step)), ms);
    return () => clearTimeout(timer);
  }, [step]);
  return { step, skip: () => setStep('end') };
}
