import { useRouter, type Href } from 'expo-router';
import { backendEnabled } from '../../data/backend';
import { useCameraPermission } from '../capture/camera';
import { href, nextAfter, type FlowContext, type Intent, type Step } from './flow';
import { hasConsent, useOnboarding } from './store';
import { usePushAsk } from '../notifications/ask';

export function parseIntent(v?: string | string[]): Intent {
  return (Array.isArray(v) ? v[0] : v) === 'import' ? 'import' : 'film';
}

export function useFlow(intent: Intent) {
  const router = useRouter();
  const camera = useCameraPermission();
  const go = (from: Step, override?: Partial<FlowContext>) => {
    const s = useOnboarding.getState();
    const ctx: FlowContext = {
      intent,
      guideHidden: s.guideHidden,
      camera: camera.status,
      accountDecided: !backendEnabled() || s.accountChoice !== null,
      consented: hasConsent(s.consent),
      notifyDecided: usePushAsk.getState().onboarded,
      completed: s.completed,
      ...override,
    };
    const d = nextAfter(from, ctx);
    const to = href(d, ctx.intent) as Href;
    if (d.kind === 'step') {
      if (d.step === from) return;
      router.push(to);
      return;
    }
    s.complete();
    router.replace(to);
  };
  return { go, camera };
}
