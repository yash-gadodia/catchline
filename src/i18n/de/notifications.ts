import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Mitteilungen einschalten.",
  // REVIEW
  'notifications.onboarding.body': "Catchline nutzt sie nur, um dir zu sagen, wenn ein Lift fertig erfasst ist. Keine Werbung, und du kannst sie jederzeit ausschalten.",
  // REVIEW
  'notifications.turnOn': "Mitteilungen einschalten",
  // REVIEW
  'notifications.openSettings': "Einstellungen öffnen",
  // REVIEW
  'notifications.notNow': "Nicht jetzt",
  // REVIEW
  'notifications.reask.title': "Bescheid bekommen, wenn dein Lift fertig ist?",
  // REVIEW
  'notifications.reask.body': "Die Erfassung läuft weiter, wenn du die App verlässt. Schalte Mitteilungen ein, und Catchline sagt dir, wenn sie fertig ist.",
  // REVIEW
  'notifications.reask.notNow': "Nicht jetzt",
  // REVIEW
  'notifications.ready.title': "Dein Lift ist fertig",
  // REVIEW
  'notifications.ready.body': "Tippe, um die Hantelbahn in deinem Video zu sehen.",
  // REVIEW
  'notifications.ready.failedTitle': "Wir konnten dein Video nicht erfassen",
  // REVIEW
  'notifications.ready.failedBody': "Tippe, um zu sehen, warum und was du als Nächstes versuchen kannst.",
  'notifications.nudge1.title': "Dein erster Hantelweg dauert etwa eine Minute",
  'notifications.nudge1.body': "Wähle ein Video eines Lifts aus deinen Aufnahmen. Catchline zeichnet den Hantelweg ein, auf deinem iPhone.",
  'notifications.nudge2.title': "Hast du einen Lift auf Video?",
  'notifications.nudge2.body': "Öffne Catchline und sieh Hantelweg und Hantelgeschwindigkeit. Das Video bleibt auf deinem iPhone.",
  'notifications.nudge3.title': "Ein Video reicht",
  'notifications.nudge3.body': "Filme deinen nächsten Lift von der Seite und sieh den Hantelweg darauf.",
};
