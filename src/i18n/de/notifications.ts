import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Mitteilungen einschalten.",
  // REVIEW
  'notifications.onboarding.body': "Catchline nutzt sie nur, um dich vor deiner nächsten Einheit an den erneuten Test deines Hinweises zu erinnern. Keine Werbung, und du kannst sie jederzeit ausschalten.",
  // REVIEW
  'notifications.turnOn': "Mitteilungen einschalten",
  // REVIEW
  'notifications.openSettings': "Einstellungen öffnen",
  // REVIEW
  'notifications.notNow': "Nicht jetzt",
  // REVIEW
  'notifications.reask.title': "Erinnerung an den erneuten Test deines Hinweises?",
  // REVIEW
  'notifications.reask.body': "Ein Hinweis sitzt erst, wenn du ihn erneut testest. Schalte Mitteilungen ein, und Catchline erinnert dich vor deiner nächsten Einheit.",
  // REVIEW
  'notifications.reask.notNow': "Nicht jetzt",
  // REVIEW
  'notifications.ready.title': "Dein {movement} ist fertig",
  // REVIEW
  'notifications.ready.body': "Tippe, um deinen Hinweis zu sehen.",
  // REVIEW
  'notifications.ready.failedTitle': "Wir konnten deinen {movement} nicht lesen",
  // REVIEW
  'notifications.ready.failedBody': "Tippe, um zu sehen, warum und was du als Nächstes versuchen kannst.",
};
