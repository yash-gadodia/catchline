import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Activa las notificaciones.",
  // REVIEW
  'notifications.onboarding.body': "Catchline solo las usa para avisarte cuando termina el seguimiento de un levantamiento. Sin publicidad, y puedes desactivarlas cuando quieras.",
  // REVIEW
  'notifications.turnOn': "Activar notificaciones",
  // REVIEW
  'notifications.openSettings': "Abrir Ajustes",
  // REVIEW
  'notifications.notNow': "Ahora no",
  // REVIEW
  'notifications.reask.title': "¿Te avisamos cuando tu levantamiento esté listo?",
  // REVIEW
  'notifications.reask.body': "El seguimiento continúa cuando sales de la app. Activa las notificaciones y Catchline te avisa cuando termine.",
  // REVIEW
  'notifications.reask.notNow': "Ahora no",
  // REVIEW
  'notifications.ready.title': "Tu levantamiento está listo",
  // REVIEW
  'notifications.ready.body': "Toca para ver la trayectoria de la barra en tu vídeo.",
  // REVIEW
  'notifications.ready.failedTitle': "No pudimos seguir tu vídeo",
  // REVIEW
  'notifications.ready.failedBody': "Toca para ver por qué y qué probar después.",
};
