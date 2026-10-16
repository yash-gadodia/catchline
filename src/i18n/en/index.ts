import { common } from './common';
import { you } from './you';
import { library } from './library';
import { analysis } from './analysis';
import { format } from './format';
import { drills } from './drills';
import { capture } from './capture';
import { onboarding } from './onboarding';
import { paywall } from './paywall';
import { share } from './share';
import { notifications } from './notifications';
import { cue } from './cue';

export const en = {
  ...common,
  ...you,
  ...library,
  ...analysis,
  ...format,
  ...drills,
  ...capture,
  ...onboarding,
  ...paywall,
  ...share,
  ...notifications,
  ...cue,
};

export type Key = keyof typeof en;
