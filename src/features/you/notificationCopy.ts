import { t } from '../../i18n';

// Three notifications, no more. The title is always the app name.
export const NOTIFICATION_TITLE = 'Catchline';

// Getters, so each read is in the current language.
export const NOTIFICATION_COPY = {
  cueReminder: (cue: string) => t('you.notify.cueReminder', { cue: `${cue.charAt(0).toLowerCase()}${cue.slice(1)}` }),
  get analysed() {
    return t('you.notify.analysed');
  },
  get queuedAnalysed() {
    return t('you.notify.queuedAnalysed');
  },
};

export type NotificationKind = keyof typeof NOTIFICATION_COPY;
