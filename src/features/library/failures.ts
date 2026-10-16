import type { Failure } from '../../analysis/types';
import { en } from '../../i18n/en';
import { isKey, t } from '../../i18n';

export type FailureReason = Failure['reason'];

export type FailureAction = 'retake' | 'import' | 'keep' | 'partial' | 'pickA' | 'pickB' | 'reanalyse' | 'later' | 'label';

export type FailureCopy = {
  kicker: string;
  title: string;
  body: string;
  primary: { label: string; action: FailureAction; outline?: boolean };
  alt?: { label: string; action: FailureAction };
  links: [{ label: string; action: FailureAction }, { label: string; action: FailureAction }];
  readout: string;
  image: string;
};

// One layout for every failure so the lifter learns it once: the frame where it
// failed with the problem marked, one-line cause, one fix, and the clip is kept.
// Built on read (getters), so the copy follows the current language.
function copyFor(reason: FailureReason): FailureCopy {
  const couldnt = t('library.failure.couldntAnalyse');
  const retake = { label: t('library.failure.retake'), action: 'retake' as const };
  const different = { label: t('library.failure.differentClip'), action: 'import' as const };
  const keep = { label: t('library.failure.keepAnyway'), action: 'keep' as const };
  switch (reason) {
    case 'bar_out_of_frame':
    case 'not_side_on':
    case 'too_dark':
    case 'too_far':
    case 'too_shaky':
      return {
        kicker: couldnt,
        title: t(`library.failure.${reason}.title` as const),
        body: t(`library.failure.${reason}.body` as const),
        primary: retake,
        links: [different, keep],
        readout: t(`library.failure.${reason}.readout` as const),
        image: IMAGE[reason],
      };
    case 'multiple_lifters':
      return {
        kicker: t('library.failure.multiple_lifters.kicker'),
        title: t('library.failure.multiple_lifters.title'),
        body: t('library.failure.multiple_lifters.body'),
        primary: { label: t('library.failure.multiple_lifters.primary'), action: 'pickA' },
        alt: { label: t('library.failure.multiple_lifters.alt'), action: 'pickB' },
        links: [{ label: t('library.failure.multiple_lifters.link0'), action: 'retake' }, different],
        readout: 'A',
        image: IMAGE[reason],
      };
    case 'clip_cut_off':
      return {
        kicker: couldnt,
        title: t('library.failure.clip_cut_off.title'),
        body: t('library.failure.clip_cut_off.body'),
        primary: retake,
        links: [different, { label: t('library.failure.clip_cut_off.link1'), action: 'partial' }],
        readout: t('library.failure.clip_cut_off.readout'),
        image: IMAGE[reason],
      };
    case 'unsupported_movement':
      return {
        kicker: t('library.failure.unsupported_movement.kicker'),
        title: t('library.failure.unsupported_movement.title'),
        body: t('library.failure.unsupported_movement.body'),
        primary: { label: t('library.failure.unsupported_movement.primary'), action: 'label', outline: true },
        links: [
          { label: t('library.failure.unsupported_movement.link0'), action: 'reanalyse' },
          { label: t('library.failure.unsupported_movement.link1'), action: 'keep' },
        ],
        readout: t('library.failure.unsupported_movement.readout'),
        image: IMAGE[reason],
      };
    case 'low_frame_rate':
      return {
        kicker: t('library.failure.low_frame_rate.kicker'),
        title: t('library.failure.low_frame_rate.title'),
        body: t('library.failure.low_frame_rate.body'),
        primary: { label: t('library.failure.low_frame_rate.primary'), action: 'retake' },
        links: [different, { label: t('library.failure.low_frame_rate.link1'), action: 'partial' }],
        readout: t('library.failure.low_frame_rate.readout'),
        image: IMAGE[reason],
      };
    case 'clip_unreadable':
      return {
        kicker: couldnt,
        title: t('library.failure.clip_unreadable.title'),
        body: t('library.failure.clip_unreadable.body'),
        primary: { label: t('library.failure.clip_unreadable.primary'), action: 'import' },
        links: [retake, { label: t('library.failure.clip_unreadable.link1'), action: 'later' }],
        readout: t('library.failure.clip_unreadable.readout'),
        image: IMAGE[reason],
      };
    case 'unknown':
      return {
        kicker: t('library.failure.unknown.kicker'),
        title: t('library.failure.unknown.title'),
        body: t('library.failure.unknown.body'),
        primary: { label: t('library.failure.unknown.primary'), action: 'reanalyse' },
        links: [
          { label: t('library.failure.unknown.link0'), action: 'later' },
          { label: 'ref', action: 'later' },
        ],
        readout: '',
        image: IMAGE[reason],
      };
  }
}

const IMAGE: Record<FailureReason, string> = {
  bar_out_of_frame: 'asset:snatch/4-extension',
  not_side_on: 'asset:snatch/1-setup',
  too_dark: 'asset:snatch/2-knee',
  too_far: 'asset:snatch/1-setup',
  too_shaky: 'asset:snatch/3-hip',
  multiple_lifters: 'asset:snatch/1-setup',
  clip_cut_off: 'asset:snatch/5-turnover',
  unsupported_movement: 'library:hs-2',
  low_frame_rate: 'asset:snatch/3-hip',
  clip_unreadable: 'asset:snatch/1-setup',
  unknown: 'asset:snatch/6-catch',
};

export const FAILURE_REASONS = Object.keys(IMAGE) as FailureReason[];

export const FAILURE_COPY = Object.defineProperties(
  {} as Record<FailureReason, FailureCopy>,
  Object.fromEntries(FAILURE_REASONS.map((r) => [r, { get: () => copyFor(r), enumerable: true }]))
);

// A stored failure line in the lifter's language when it is one of ours (the title for its reason).
export function failureMessage(f: Failure): string {
  const key = `library.failure.${f.reason}.title`;
  return isKey(key) && en[key] === f.message ? t(key) : f.message;
}
