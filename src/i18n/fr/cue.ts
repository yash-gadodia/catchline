// REVIEW: machine-drafted French cue copy. A native-speaking weightlifting / CrossFit coach must review
// every line before it is trusted: the cue wording is the product. Keys mirror src/i18n/en/cue.ts;
// {m} is the measurement and {side} the elbow, both filled from the worker's English.
import type { Strings } from '../types';
import type { cue as en } from '../en/cue';

export const review = true;

export const cue: Strings<typeof en> = {
  'cue.text.early_arm_bend': "Laisse pendre la barre, redresse-toi à travers elle.",
  'cue.text.hips_rise_early': "Pousse le sol, la poitrine monte.",
  'cue.text.bar_forward_off_hips': "Frôle la barre vers le haut, ne la frappe pas.",
  'cue.text.jump_forward': "Reçois-toi sur ta ligne de départ.",
  'cue.text.incomplete_extension': "Finis grand, puis descends.",
  'cue.text.press_out': "Frappe la barre vers le haut quand tes pieds atterrissent.",
  'cue.text.forward_dip': "Descends droit, comme dans un ascenseur.",
  'cue.text.bar_forward_overhead': "Finis avec la barre derrière les oreilles.",
  'cue.text.chest_dive': "Mène la fente avec le talon avant.",
  'cue.text.early_arm_pull': "Appuie sur la barre avant de plier.",
  'cue.text.leg_kip': "Pieds collés, balance-toi depuis la barre.",
  'cue.text.no_push_away': "Menton au-dessus, puis repousse la barre.",
  'cue.text.bmu_early_pull': "Appuie sur la barre, balance-toi au-delà.",
  'cue.text.hips_low_transition': "Monte les genoux vers la barre.",
  'cue.text.chicken_wing': "Passe les deux coudes en même temps.",
  'cue.text.hspu_kip_timing': "Genoux aux coudes, puis frappe le plafond.",
  'cue.text.hspu_banana': "Pousse les talons le long du mur.",
  'cue.why.early_arm_bend': "Tes coudes ont plié {m} avant la fin de l'extension des hanches, donc la barre a perdu la vitesse des jambes.",
  'cue.why.hips_rise_early': "L'angle de ton dos a baissé de {m} entre le sol et le genou, ce qui a mis la barre devant toi.",
  'cue.why.bar_forward_off_hips': "La barre est partie de {m} vers l'avant après le contact des hanches, donc tu as dû la rattraper.",
  'cue.why.jump_forward': "Tes pieds ont atterri {m} devant leur position de départ.",
  'cue.why.incomplete_extension': "Tes hanches se sont arrêtées à {m} de l'extension complète avant de passer sous la barre.",
  'cue.why.press_out': "Il manquait {m} à tes coudes pour être verrouillés quand la barre a atteint son point haut, puis tu as poussé le reste.",
  'cue.why.forward_dip': "La barre a avancé de {m} pendant ta flexion, donc la poussée est partie vers l'avant aussi.",
  'cue.why.bar_forward_overhead': "La barre s'est verrouillée {m} devant la ligne de tes épaules.",
  'cue.why.chest_dive': "Ton buste s'est penché de {m} vers l'avant dans la fente, laissant tes hanches derrière la barre.",
  'cue.why.early_arm_pull': "Tes coudes ont plié {m} avant l'ouverture des hanches, ce qui a transformé le kip en traction stricte.",
  'cue.why.leg_kip': "Tes genoux ont plié de {m} à chaque balancier alors que tes épaules bougeaient à peine.",
  'cue.why.no_push_away': "Tu es redescendu tout droit après la répétition, donc le balancier suivant n'avait rien à charger.",
  'cue.why.bmu_early_pull': "Tes coudes ont plié avec les hanches {m} sous la barre, tu as tiré vers elle, pas autour.",
  'cue.why.hips_low_transition': "Tes hanches ont culminé {m} sous la barre, vise environ 20 cm.",
  'cue.why.chicken_wing': "Ton coude {side} a passé la barre {m} après l'autre.",
  'cue.why.hspu_kip_timing': "Tes genoux se sont arrêtés {m} au-dessus des hanches avant le kick, donc les hanches n'ont donné aucune poussée.",
  'cue.why.hspu_banana': "Tes hanches étaient à {m} du mur en haut.",
  'cue.side.left': "gauche",
  'cue.side.right': "droit",
  'cue.side.late': "en retard",
};
