import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Activa las notificaciones.",
  // REVIEW
  'notifications.onboarding.body': "Catchline solo las usa para recordarte que vuelvas a probar tu indicación antes de tu próxima sesión. Sin publicidad, y puedes desactivarlas cuando quieras.",
  // REVIEW
  'notifications.turnOn': "Activar notificaciones",
  // REVIEW
  'notifications.openSettings': "Abrir Ajustes",
  // REVIEW
  'notifications.notNow': "Ahora no",
  // REVIEW
  'notifications.reask.title': "¿Un recordatorio para volver a probar tu indicación?",
  // REVIEW
  'notifications.reask.body': "Una indicación solo se queda si la vuelves a probar. Activa las notificaciones y Catchline te lo recordará antes de tu próxima sesión.",
  // REVIEW
  'notifications.reask.notNow': "Ahora no",
  // REVIEW
  'notifications.ready.title': "Tu {movement} está listo",
  // REVIEW
  'notifications.ready.body': "Toca para ver tu indicación.",
  // REVIEW
  'notifications.ready.failedTitle': "No pudimos leer tu {movement}",
  // REVIEW
  'notifications.ready.failedBody': "Toca para ver por qué y qué probar después.",
};
