import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  // REVIEW
  'notifications.onboarding.title': "Ative as notificações.",
  // REVIEW
  'notifications.onboarding.body': "O Catchline só as usa para avisar quando o rastreamento de um levantamento termina. Sem marketing, e você pode desativá-las quando quiser.",
  // REVIEW
  'notifications.turnOn': "Ativar notificações",
  // REVIEW
  'notifications.openSettings': "Abrir Ajustes",
  // REVIEW
  'notifications.notNow': "Agora não",
  // REVIEW
  'notifications.reask.title': "Quer ser avisado quando seu levantamento estiver pronto?",
  // REVIEW
  'notifications.reask.body': "O rastreamento continua quando você sai do app. Ative as notificações e o Catchline avisa quando terminar.",
  // REVIEW
  'notifications.reask.notNow': "Agora não",
  // REVIEW
  'notifications.ready.title': "Seu levantamento está pronto",
  // REVIEW
  'notifications.ready.body': "Toque para ver a trajetória da barra no seu vídeo.",
  // REVIEW
  'notifications.ready.failedTitle': "Não conseguimos rastrear seu vídeo",
  // REVIEW
  'notifications.ready.failedBody': "Toque para ver o porquê e o que tentar em seguida.",
  'notifications.feedback.title': "Como está sendo usar o Catchline?",
  'notifications.feedback.body': "Conte o que precisa de conserto ou o que falta. Leva um minuto.",
  'notifications.freeBack.title': "Seu vídeo grátis voltou",
  'notifications.freeBack.body': "Semana nova: analise um levantamento grátis. Escolha um vídeo e veja a trajetória da barra.",
  'notifications.nudge1.title': "Sua primeira trajetória da barra leva um minuto",
  'notifications.nudge1.body': "Escolha um vídeo de um levantamento do seu rolo. O Catchline desenha a trajetória da barra no seu telefone.",
  'notifications.nudge2.title': "Tem um levantamento em vídeo?",
  'notifications.nudge2.body': "Abra o Catchline para ver a trajetória e a velocidade da barra. O vídeo fica no seu telefone.",
  'notifications.nudge3.title': "Um vídeo já basta",
  'notifications.nudge3.body': "Filme seu próximo levantamento de lado e veja a trajetória da barra desenhada nele.",
};
