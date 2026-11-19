// REVIEW: machine-drafted Italian, needs a native-speaking lifter before release.
import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  'notifications.onboarding.title': "Attiva le notifiche.",
  'notifications.onboarding.body': "Catchline le usa solo per dirti quando un'alzata ha finito il tracciamento. Niente marketing, e puoi disattivarle quando vuoi.",
  'notifications.turnOn': "Attiva le notifiche",
  'notifications.openSettings': "Apri Impostazioni",
  'notifications.notNow': "Non ora",
  'notifications.reask.title': "Ti avvisiamo quando l'alzata è pronta?",
  'notifications.reask.body': "Il tracciamento continua quando esci dall'app. Attiva le notifiche e Catchline ti dice quando ha finito.",
  'notifications.reask.notNow': "Non ora",
  'notifications.ready.title': "La tua alzata è pronta",
  'notifications.ready.body': "Tocca per vedere la traiettoria del bilanciere sul tuo video.",
  'notifications.ready.failedTitle': "Non siamo riusciti a tracciare il tuo video",
  'notifications.ready.failedBody': "Tocca per vedere perché e cosa provare.",
  'notifications.feedback.title': "Come ti trovi con Catchline?",
  'notifications.feedback.body': "Dicci cosa sistemare o cosa manca. Basta un minuto.",
  'notifications.freeBack.title': "Il tuo video gratuito è tornato",
  'notifications.freeBack.body': "Nuova settimana: analizza un'alzata gratis. Scegli un video e guarda la traiettoria del bilanciere.",
  'notifications.nudge1.title': "La tua prima traiettoria richiede un minuto",
  'notifications.nudge1.body': "Scegli il video di un sollevamento dal rullino. Catchline disegna la traiettoria del bilanciere sul tuo telefono.",
  'notifications.nudge2.title': "Hai un sollevamento in video?",
  'notifications.nudge2.body': "Apri Catchline per vedere traiettoria e velocità del bilanciere. Il video resta sul tuo telefono.",
  'notifications.nudge3.title': "Basta un video",
  'notifications.nudge3.body': "Filma il prossimo sollevamento di lato e guarda la traiettoria del bilanciere disegnata sopra.",
};
