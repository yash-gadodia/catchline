// Three notifications, no more. The title is always the app name.
export const NOTIFICATION_TITLE = 'Catchline';

export const NOTIFICATION_COPY = {
  cueReminder: (cue: string) => `Next session: ${cue.charAt(0).toLowerCase()}${cue.slice(1)}`,
  analysed: 'Your lift is analysed',
  queuedAnalysed: 'Your queued lifts are analysed',
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_COPY;
