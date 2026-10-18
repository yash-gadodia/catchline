// REVIEW: machine-drafted Spanish cue copy. A native-speaking weightlifting / CrossFit coach must review
// every line before it is trusted: the cue wording is the product. Keys mirror src/i18n/en/cue.ts;
// {m} is the measurement and {side} the elbow, both filled from the worker's English.
import type { Strings } from '../types';
import type { cue as en } from '../en/cue';

export const review = true;

export const cue: Strings<typeof en> = {
  'cue.text.early_arm_bend': "Deja colgar la barra; levántate a través de ella.",
  'cue.text.hips_rise_early': "Empuja el suelo, el pecho sube.",
  'cue.text.bar_forward_off_hips': "Roza la barra hacia arriba, no la golpees.",
  'cue.text.jump_forward': "Aterriza en la línea donde empezaste.",
  'cue.text.incomplete_extension': "Termina alto, luego baja.",
  'cue.text.press_out': "Golpea la barra hacia arriba al aterrizar.",
  'cue.text.forward_dip': "Baja recto, como en un ascensor.",
  'cue.text.bar_forward_overhead': "Termina con la barra detrás de las orejas.",
  'cue.text.chest_dive': "Abre la tijera con el talón delantero.",
  'cue.text.early_arm_pull': "Empuja la barra hacia abajo antes de doblar.",
  'cue.text.leg_kip': "Pies pegados; balancéate desde la barra.",
  'cue.text.no_push_away': "Barbilla arriba, luego aleja la barra.",
  'cue.text.bmu_early_pull': "Empuja la barra abajo, balancéate más allá.",
  'cue.text.hips_low_transition': "Lleva las rodillas hacia la barra.",
  'cue.text.chicken_wing': "Pasa los dos codos a la vez.",
  'cue.text.hspu_kip_timing': "Rodillas a los codos, luego patea el techo.",
  'cue.text.hspu_banana': "Sube los talones por la pared.",
  'cue.text.slow_turnover': "Métete bajo la barra, rápido.",
  'cue.text.bar_crash': "Ve a buscar la barra; bloquea al aterrizar.",
  'cue.why.early_arm_bend': "Tus codos se doblaron {m} antes de que tus caderas terminaran, así que la barra perdió la velocidad de las piernas.",
  'cue.why.hips_rise_early': "El ángulo de tu espalda bajó {m} entre el suelo y la rodilla, lo que dejó la barra delante de ti.",
  'cue.why.bar_forward_off_hips': "La barra salió {m} hacia delante tras el contacto con la cadera, así que tuviste que perseguirla.",
  'cue.why.jump_forward': "Tus pies aterrizaron {m} por delante de donde empezaron.",
  'cue.why.incomplete_extension': "Tus caderas se quedaron a {m} de la extensión completa antes de meterte debajo.",
  'cue.why.press_out': "A tus codos les faltaban {m} para bloquear cuando la barra llegó arriba, y luego presionaste el resto.",
  'cue.why.forward_dip': "La barra se movió {m} hacia delante durante el dip, así que el impulso también fue hacia delante.",
  'cue.why.bar_forward_overhead': "La barra se bloqueó {m} por delante de la línea de tus hombros.",
  'cue.why.chest_dive': "Tu torso se inclinó {m} hacia delante en la tijera, dejando las caderas detrás de la barra.",
  'cue.why.early_arm_pull': "Tus codos se doblaron {m} antes de que se abrieran tus caderas, y el kip se convirtió en una dominada estricta.",
  'cue.why.leg_kip': "Tus rodillas se doblaron {m} en cada balanceo mientras tus hombros apenas se movían.",
  'cue.why.no_push_away': "Caíste recto después de la repetición, así que el siguiente balanceo no tuvo nada que cargar.",
  'cue.why.bmu_early_pull': "Tus codos se doblaron con las caderas {m} por debajo de la barra; tiraste hacia ella, no alrededor de ella.",
  'cue.why.hips_low_transition': "Tus caderas llegaron a su punto más alto {m} por debajo de la barra; busca unos 20 cm.",
  'cue.why.chicken_wing': "Tu codo {side} pasó la barra {m} después que el otro.",
  'cue.why.hspu_kip_timing': "Tus rodillas se detuvieron {m} por encima de las caderas antes de la patada, así que las caderas no dieron impulso.",
  'cue.why.hspu_banana': "Tus caderas quedaron a {m} de la pared arriba del todo.",
  'cue.why.slow_turnover': "Tardaste {m} desde la extensión completa hasta bloquear, así que la barra ya caía antes de que estuvieras debajo.",
  'cue.why.bar_crash': "La barra cayó {m} desde su punto más alto antes de que bloquearas los brazos, así que cayó sobre ti.",
  'cue.side.left': "izquierdo",
  'cue.side.right': "derecho",
  'cue.side.late': "retrasado",
};
