export type Step = 'launch' | 'welcome' | 'demo' | 'lifts' | 'sample' | 'guide' | 'camera' | 'account' | 'privacy';

// 'film' heads for the viewfinder; 'import' heads for the library picker and
// never asks for the camera.
export type Intent = 'film' | 'import';

export type CameraStatus = 'granted' | 'denied' | 'undetermined';

export type FlowContext = {
  intent: Intent;
  guideHidden: boolean;
  camera: CameraStatus;
  accountDecided: boolean;
  consented: boolean;
  completed: boolean;
};

export type Destination =
  | { kind: 'step'; step: Step }
  | { kind: 'capture' }
  | { kind: 'import' };

const step = (s: Step): Destination => ({ kind: 'step', step: s });

function finish(ctx: FlowContext): Destination {
  if (!ctx.accountDecided) return step('account');
  if (!ctx.consented) return step('privacy');
  return ctx.intent === 'import' ? { kind: 'import' } : { kind: 'capture' };
}

function afterGuide(ctx: FlowContext): Destination {
  if (ctx.intent === 'film' && ctx.camera !== 'granted') return step('camera');
  return finish(ctx);
}

// Launch to first analysis: welcome, the demo, lift picker, filming guide, camera,
// account (Apple or not), privacy. Each step skips what the user has already done.
export function nextAfter(current: Step, ctx: FlowContext): Destination {
  switch (current) {
    case 'launch':
      return ctx.completed ? finish(ctx) : step('welcome');
    case 'welcome':
    case 'demo':
      return ctx.intent === 'import' ? finish(ctx) : step('lifts');
    case 'lifts':
    case 'sample':
      return ctx.guideHidden ? afterGuide(ctx) : step('guide');
    case 'guide':
      return afterGuide(ctx);
    case 'camera':
      return ctx.intent === 'film' && ctx.camera !== 'granted' ? step('camera') : finish(ctx);
    case 'account':
      return finish({ ...ctx, accountDecided: true });
    case 'privacy':
      return ctx.consented ? (ctx.intent === 'import' ? { kind: 'import' } : afterPrivacy(ctx)) : step('privacy');
  }
}

function afterPrivacy(ctx: FlowContext): Destination {
  return ctx.camera === 'granted' ? { kind: 'capture' } : step('camera');
}

export function href(d: Destination, intent: Intent): string {
  if (d.kind === 'capture') return '/capture';
  if (d.kind === 'import') return '/capture/import';
  const path = d.step === 'launch' ? '/onboarding' : `/onboarding/${d.step}`;
  return intent === 'import' ? `${path}?intent=import` : path;
}
