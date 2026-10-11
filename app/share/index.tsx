import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAnalysis } from '../../src/analysis/fixtures';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import ShareScreen from '../../src/features/share/ShareScreen';
import { STUCK_FIXTURE } from '../../src/features/share/stuck';
import { ASPECTS, SHARE_TYPES, type ExportState } from '../../src/features/share/model';

const STATES: ExportState[] = ['idle', 'rendering', 'saved', 'failed'];

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

export default function ShareRoute() {
  const p = useLocalSearchParams<{ fixture?: string; type?: string; aspect?: string; state?: string; tier?: string }>();
  const router = useRouter();
  const isPro = usePurchases((s) => s.isPro);
  const analysis = getAnalysis(p.fixture);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <ShareScreen
      key={`${analysis.id}-${p.type ?? ''}-${p.aspect ?? ''}-${p.state ?? ''}-${p.tier ?? ''}`}
      analysis={analysis}
      pro={p.tier ? p.tier === 'pro' : isPro}
      stuck={STUCK_FIXTURE}
      initialType={pick(p.type, SHARE_TYPES.map((t) => t.value), 'strobe_card')}
      initialAspect={pick(p.aspect, ASPECTS, '9:16')}
      initialState={pick(p.state, STATES, 'idle')}
      initialFailure={p.type === 'overlay_video' ? 'not_available' : 'render_error'}
      onBack={back}
      onSendToCoach={() => router.push({ pathname: '/share/coach', params: { fixture: analysis.id } })}
    />
  );
}
