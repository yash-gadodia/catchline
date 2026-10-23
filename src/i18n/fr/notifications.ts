import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Active les notifications.",
  // REVIEW
  'notifications.onboarding.body': "Catchline s’en sert uniquement pour te rappeler de retester ta consigne avant ta prochaine séance. Pas de pub, et tu peux les couper à tout moment.",
  // REVIEW
  'notifications.turnOn': "Activer les notifications",
  // REVIEW
  'notifications.openSettings': "Ouvrir Réglages",
  // REVIEW
  'notifications.notNow': "Plus tard",
  // REVIEW
  'notifications.reask.title': "Un rappel pour retester ta consigne ?",
  // REVIEW
  'notifications.reask.body': "Une consigne ne tient que si tu la retestes. Active les notifications et Catchline te le rappelle avant ta prochaine séance.",
  // REVIEW
  'notifications.reask.notNow': "Plus tard",
};
