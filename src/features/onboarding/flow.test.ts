import { href, nextAfter, type FlowContext } from './flow';

const fresh: FlowContext = { intent: 'film', guideHidden: false, camera: 'undetermined', accountDecided: true, consented: false, notifyDecided: true, completed: false };

describe('first-run flow', () => {
  it('walks a new lifter through every step in design order', () => {
    expect(nextAfter('launch', fresh)).toEqual({ kind: 'step', step: 'welcome' });
    expect(nextAfter('welcome', fresh)).toEqual({ kind: 'step', step: 'lifts' });
    expect(nextAfter('demo', fresh)).toEqual({ kind: 'step', step: 'lifts' });
    expect(nextAfter('lifts', fresh)).toEqual({ kind: 'step', step: 'guide' });
    expect(nextAfter('sample', fresh)).toEqual({ kind: 'step', step: 'guide' });
    expect(nextAfter('guide', fresh)).toEqual({ kind: 'step', step: 'camera' });
    expect(nextAfter('camera', { ...fresh, camera: 'granted' })).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('privacy', { ...fresh, camera: 'granted', consented: true })).toEqual({ kind: 'capture' });
  });

  it('skips the guide once hidden and the camera step once granted', () => {
    expect(nextAfter('sample', { ...fresh, guideHidden: true })).toEqual({ kind: 'step', step: 'camera' });
    expect(nextAfter('sample', { ...fresh, guideHidden: true, camera: 'granted' })).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('guide', { ...fresh, camera: 'granted', consented: true })).toEqual({ kind: 'capture' });
  });

  it('stays on the camera step while permission is refused', () => {
    expect(nextAfter('camera', { ...fresh, camera: 'denied' })).toEqual({ kind: 'step', step: 'camera' });
  });

  it('sends an import straight to consent, then the library, never the camera', () => {
    const imp = { ...fresh, intent: 'import' as const };
    expect(nextAfter('welcome', imp)).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('camera', imp)).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('privacy', { ...imp, consented: true })).toEqual({ kind: 'import' });
    expect(nextAfter('welcome', { ...imp, consented: true })).toEqual({ kind: 'import' });
    expect(nextAfter('demo', imp)).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('demo', { ...imp, consented: true })).toEqual({ kind: 'import' });
  });

  it('offers an account after the camera and before consent, once, on both paths', () => {
    const undecided = { ...fresh, accountDecided: false };
    expect(nextAfter('camera', { ...undecided, camera: 'granted' })).toEqual({ kind: 'step', step: 'account' });
    expect(nextAfter('guide', { ...undecided, camera: 'granted' })).toEqual({ kind: 'step', step: 'account' });
    expect(nextAfter('account', undecided)).toEqual({ kind: 'step', step: 'privacy' });
    expect(nextAfter('account', { ...undecided, consented: true, camera: 'granted' })).toEqual({ kind: 'capture' });
    expect(nextAfter('welcome', { ...undecided, intent: 'import' })).toEqual({ kind: 'step', step: 'account' });
    expect(nextAfter('account', { ...undecided, intent: 'import', consented: true })).toEqual({ kind: 'import' });
    expect(nextAfter('launch', { ...undecided, completed: true, consented: true, camera: 'granted' })).toEqual({ kind: 'step', step: 'account' });
    expect(href({ kind: 'step', step: 'account' }, 'import')).toBe('/onboarding/account?intent=import');
  });

  it('asks for notifications once, right after consent, on both paths', () => {
    const undecided = { ...fresh, notifyDecided: false, consented: true };
    expect(nextAfter('privacy', { ...undecided, camera: 'granted' })).toEqual({ kind: 'step', step: 'notify' });
    expect(nextAfter('notify', { ...undecided, camera: 'granted' })).toEqual({ kind: 'capture' });
    expect(nextAfter('notify', undecided)).toEqual({ kind: 'step', step: 'camera' });
    expect(nextAfter('privacy', { ...undecided, intent: 'import' })).toEqual({ kind: 'step', step: 'notify' });
    expect(nextAfter('notify', { ...undecided, intent: 'import' })).toEqual({ kind: 'import' });
    expect(nextAfter('guide', { ...undecided, camera: 'granted' })).toEqual({ kind: 'step', step: 'notify' });
    expect(href({ kind: 'step', step: 'notify' }, 'import')).toBe('/onboarding/notify?intent=import');
  });

  it('opens straight on the viewfinder after first run', () => {
    expect(nextAfter('launch', { ...fresh, completed: true, consented: true, camera: 'granted' })).toEqual({ kind: 'capture' });
  });

  it('builds hrefs that keep the import intent', () => {
    expect(href({ kind: 'step', step: 'privacy' }, 'import')).toBe('/onboarding/privacy?intent=import');
    expect(href({ kind: 'step', step: 'lifts' }, 'film')).toBe('/onboarding/lifts');
    expect(href({ kind: 'capture' }, 'film')).toBe('/capture');
    expect(href({ kind: 'import' }, 'import')).toBe('/capture/import');
  });
});
