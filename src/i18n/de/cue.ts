// REVIEW: machine-drafted German cue copy. A native-speaking weightlifting / CrossFit coach must review
// every line before it is trusted: the cue wording is the product. Keys mirror src/i18n/en/cue.ts;
// {m} is the measurement and {side} the elbow, both filled from the worker's English.
import type { Strings } from '../types';
import type { cue as en } from '../en/cue';

export const review = true;

export const cue: Strings<typeof en> = {
  'cue.text.early_arm_bend': "Lass die Stange hängen, steh durch sie auf.",
  'cue.text.hips_rise_early': "Drück den Boden weg, die Brust kommt hoch.",
  'cue.text.bar_forward_off_hips': "Streif die Stange hoch, schlag sie nicht weg.",
  'cue.text.jump_forward': "Lande auf der Linie, auf der du gestartet bist.",
  'cue.text.incomplete_extension': "Erst ganz strecken, dann runter.",
  'cue.text.press_out': "Stoß die Stange hoch, wenn die Füße landen.",
  'cue.text.forward_dip': "Dip gerade nach unten, wie im Aufzug.",
  'cue.text.bar_forward_overhead': "Beende mit der Stange hinter den Ohren.",
  'cue.text.chest_dive': "Führ den Ausfallschritt mit der vorderen Ferse.",
  'cue.text.early_arm_pull': "Drück die Stange runter, bevor du beugst.",
  'cue.text.leg_kip': "Füße zusammen, schwing aus der Stange.",
  'cue.text.no_push_away': "Kinn drüber, dann die Stange wegdrücken.",
  'cue.text.bmu_early_pull': "Drück die Stange runter, schwing an ihr vorbei.",
  'cue.text.hips_low_transition': "Bring die Knie hoch zur Stange.",
  'cue.text.chicken_wing': "Beide Ellbogen gleichzeitig drüber.",
  'cue.text.hspu_kip_timing': "Knie zu den Ellbogen, dann gegen die Decke treten.",
  'cue.text.hspu_banana': "Schieb die Fersen die Wand hoch.",
  'cue.text.slow_turnover': "Zieh dich schnell unter die Stange.",
  'cue.text.bar_crash': "Hol dir die Stange; sperr aus, wenn du landest.",
  'cue.why.early_arm_bend': "Deine Ellbogen beugten sich {m}, bevor die Hüfte fertig war, so verlor die Stange den Schwung aus den Beinen.",
  'cue.why.hips_rise_early': "Dein Rückenwinkel fiel um {m} zwischen Boden und Knie, dadurch kam die Stange vor dich.",
  'cue.why.bar_forward_off_hips': "Die Stange flog nach dem Hüftkontakt {m} nach vorn, also musstest du ihr hinterher.",
  'cue.why.jump_forward': "Deine Füße landeten {m} vor ihrer Startposition.",
  'cue.why.incomplete_extension': "Deine Hüfte blieb {m} vor der vollen Streckung stehen, bevor du unter die Stange gingst.",
  'cue.why.press_out': "Deinen Ellbogen fehlten {m} zum Durchdrücken, als die Stange oben war, den Rest hast du nachgedrückt.",
  'cue.why.forward_dip': "Die Stange wanderte im Dip {m} nach vorn, also ging auch der Antrieb nach vorn.",
  'cue.why.bar_forward_overhead': "Die Stange war {m} vor deiner Schulterlinie fixiert.",
  'cue.why.chest_dive': "Dein Oberkörper neigte sich im Ausfallschritt {m} nach vorn, die Hüfte blieb hinter der Stange.",
  'cue.why.early_arm_pull': "Deine Ellbogen beugten sich {m}, bevor sich die Hüfte öffnete, aus dem Kip wurde ein strikter Klimmzug.",
  'cue.why.leg_kip': "Deine Knie beugten sich bei jedem Schwung um {m}, während sich die Schultern kaum bewegten.",
  'cue.why.no_push_away': "Du bist nach der Wiederholung gerade nach unten gefallen, also hatte der nächste Schwung nichts zum Aufladen.",
  'cue.why.bmu_early_pull': "Deine Ellbogen beugten sich, als die Hüfte {m} unter der Stange war; du hast zur Stange gezogen, nicht um sie herum.",
  'cue.why.hips_low_transition': "Deine Hüfte erreichte ihren höchsten Punkt {m} unter der Stange; ziel auf etwa 20 cm.",
  'cue.why.chicken_wing': "Dein {side} Ellbogen kam {m} nach dem anderen über die Stange.",
  'cue.why.hspu_kip_timing': "Deine Knie stoppten {m} über der Hüfte vor dem Kick, also kam kein Antrieb aus der Hüfte.",
  'cue.why.hspu_banana': "Deine Hüfte war oben {m} von der Wand entfernt.",
  'cue.why.slow_turnover': "Von der vollen Streckung bis zum Aussperren vergingen {m}, also fiel die Stange schon, bevor du darunter warst.",
  'cue.why.bar_crash': "Die Stange fiel {m} von ihrem Hochpunkt, bevor deine Arme ausgesperrt waren, und landete so auf dir.",
  'cue.side.left': "linker",
  'cue.side.right': "rechter",
  'cue.side.late': "späterer",
};
