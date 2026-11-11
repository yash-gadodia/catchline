import { newClip, type Clip } from './store';

export type DemoKind = 'ok' | 'share' | 'import';

// Sample clips (uri null = the bundled lift) for dev links and design QA in a
// simulator, which has no camera.
export function demoClip(kind: DemoKind): Clip {
  if (kind === 'share') return newClip({ uri: null, durationS: 11, fps: 30, source: 'share', from: 'WhatsApp' });
  if (kind === 'import') return newClip({ uri: null, durationS: 102, fps: 30, source: 'library' });
  return newClip({ uri: null, durationS: 8, fps: 30, source: 'camera', trim: { start: 1.4, end: 7.6 } });
}
