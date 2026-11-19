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
  'notifications.feedback.title': "¿Qué tal te va con Catchline?",
  'notifications.feedback.body': "Cuéntanos qué arreglar o qué falta. Lleva un minuto.",
  'notifications.freeBack.title': "Tu vídeo gratis ha vuelto",
  'notifications.freeBack.body': "Nueva semana: analiza un levantamiento gratis. Elige un vídeo y mira la trayectoria de la barra.",
  'notifications.nudge1.title': "Tu primera trayectoria de barra tarda un minuto",
  'notifications.nudge1.body': "Elige un vídeo de un levantamiento de tu carrete. Catchline dibuja la trayectoria de la barra en tu teléfono.",
  'notifications.nudge2.title': "¿Tienes un levantamiento en vídeo?",
  'notifications.nudge2.body': "Abre Catchline para ver su trayectoria y la velocidad de la barra. El vídeo no sale de tu teléfono.",
  'notifications.nudge3.title': "Con un vídeo basta",
  'notifications.nudge3.body': "Graba tu próximo levantamiento de lado y mira la trayectoria de la barra dibujada encima.",
};
