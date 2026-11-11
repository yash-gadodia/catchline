import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Active les notifications.",
  // REVIEW
  'notifications.onboarding.body': "Catchline s’en sert uniquement pour te dire quand le suivi d’un mouvement est terminé. Pas de pub, et tu peux les couper à tout moment.",
  // REVIEW
  'notifications.turnOn': "Activer les notifications",
  // REVIEW
  'notifications.openSettings': "Ouvrir Réglages",
  // REVIEW
  'notifications.notNow': "Plus tard",
  // REVIEW
  'notifications.reask.title': "Être prévenu quand ton mouvement est prêt ?",
  // REVIEW
  'notifications.reask.body': "Le suivi continue quand tu quittes l’app. Active les notifications et Catchline te prévient quand c’est terminé.",
  // REVIEW
  'notifications.reask.notNow': "Plus tard",
  // REVIEW
  'notifications.ready.title': "Ton mouvement est prêt",
  // REVIEW
  'notifications.ready.body': "Touche pour voir la trajectoire de la barre sur ta vidéo.",
  // REVIEW
  'notifications.ready.failedTitle': "Nous n'avons pas pu suivre ta vidéo",
  // REVIEW
  'notifications.ready.failedBody': "Touche pour voir pourquoi, et quoi essayer ensuite.",
};
