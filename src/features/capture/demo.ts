import { newClip, type Clip } from './store';
import { DEMO_IMPORT, DEMO_SETS } from './sets';

export type DemoKind = 'ok' | 'override' | 'cutoff' | 'share' | 'import';

// Sample clips (uri null = the bundled lift) for dev links and design QA in a
// simulator, which has no camera.
export function demoClip(kind: DemoKind): Clip {
  switch (kind) {
    case 'override':
      return newClip({ uri: null, durationS: 8, fps: 30, source: 'camera', movement: 'snatch', overridden: ['whole_body'] });
    case 'cutoff':
      return newClip({ uri: null, durationS: 3, fps: 30, source: 'camera', movement: 'snatch', cutOffFrame: 186 });
    case 'share':
      return newClip({
        uri: null,
        durationS: 11,
        fps: 30,
        source: 'share',
        from: 'WhatsApp',
        movement: 'kipping_hspu',
        movementGuessed: true,
      });
    case 'import':
      return newClip({
        uri: null,
        durationS: DEMO_IMPORT.durationS,
        fps: DEMO_IMPORT.fps,
        source: 'library',
        movement: 'bar_muscle_up',
        sets: DEMO_SETS,
        setIndex: DEMO_IMPORT.setIndex,
      });
    case 'ok':
      return newClip({
        uri: null,
        durationS: 8,
        fps: 30,
        source: 'camera',
        movement: 'snatch',
        repsFound: 3,
        trim: { start: 1.4, end: 7.6 },
      });
  }
}

export function isDemoKind(v?: string): v is DemoKind {
  return v === 'ok' || v === 'override' || v === 'cutoff' || v === 'share' || v === 'import';
}
