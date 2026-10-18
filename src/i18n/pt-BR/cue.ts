// REVIEW: machine-drafted Brazilian Portuguese cue copy. A native-speaking weightlifting / CrossFit coach must review
// every line before it is trusted: the cue wording is the product. Keys mirror src/i18n/en/cue.ts;
// {m} is the measurement and {side} the elbow, both filled from the worker's English.
import type { Strings } from '../types';
import type { cue as en } from '../en/cue';

export const review = true;

export const cue: Strings<typeof en> = {
  'cue.text.early_arm_bend': "Deixe a barra pendurada; levante-se através dela.",
  'cue.text.hips_rise_early': "Empurre o chão, o peito sobe.",
  'cue.text.bar_forward_off_hips': "Raspe a barra para cima, não bata nela.",
  'cue.text.jump_forward': "Aterrisse na linha onde você começou.",
  'cue.text.incomplete_extension': "Termine alto, depois desça.",
  'cue.text.press_out': "Soque a barra para cima quando os pés tocarem o chão.",
  'cue.text.forward_dip': "Desça reto, como num elevador.",
  'cue.text.bar_forward_overhead': "Termine com a barra atrás das orelhas.",
  'cue.text.chest_dive': "Abra a tesoura com o calcanhar da frente.",
  'cue.text.early_arm_pull': "Empurre a barra para baixo antes de dobrar.",
  'cue.text.leg_kip': "Pés colados; balance a partir da barra.",
  'cue.text.no_push_away': "Queixo acima, depois empurre a barra para longe.",
  'cue.text.bmu_early_pull': "Empurre a barra para baixo, balance além dela.",
  'cue.text.hips_low_transition': "Leve os joelhos até a barra.",
  'cue.text.chicken_wing': "Passe os dois cotovelos ao mesmo tempo.",
  'cue.text.hspu_kip_timing': "Joelhos nos cotovelos, depois chute o teto.",
  'cue.text.hspu_banana': "Leve os calcanhares para cima pela parede.",
  'cue.text.slow_turnover': "Puxe-se para baixo da barra, rápido.",
  'cue.text.bar_crash': "Vá ao encontro da barra; trave ao aterrissar.",
  'cue.why.early_arm_bend': "Seus cotovelos dobraram {m} antes de o quadril terminar, então a barra perdeu a velocidade das pernas.",
  'cue.why.hips_rise_early': "O ângulo das suas costas caiu {m} entre o chão e o joelho, o que deixou a barra à sua frente.",
  'cue.why.bar_forward_off_hips': "A barra foi {m} para a frente depois do contato com o quadril, então você teve que correr atrás dela.",
  'cue.why.jump_forward': "Seus pés aterrissaram {m} à frente de onde começaram.",
  'cue.why.incomplete_extension': "Seu quadril parou a {m} da extensão completa antes de você entrar embaixo da barra.",
  'cue.why.press_out': "Faltavam {m} para seus cotovelos travarem quando a barra chegou ao ponto mais alto, e você empurrou o resto.",
  'cue.why.forward_dip': "A barra foi {m} para a frente durante o dip, então o impulso também foi para a frente.",
  'cue.why.bar_forward_overhead': "A barra travou {m} à frente da linha dos seus ombros.",
  'cue.why.chest_dive': "Seu tronco inclinou {m} para a frente na tesoura, deixando o quadril atrás da barra.",
  'cue.why.early_arm_pull': "Seus cotovelos dobraram {m} antes de o quadril abrir, transformando o kip numa barra estrita.",
  'cue.why.leg_kip': "Seus joelhos dobraram {m} em cada balanço enquanto seus ombros quase não se moveram.",
  'cue.why.no_push_away': "Você caiu reto depois da repetição, então o próximo balanço não teve nada para carregar.",
  'cue.why.bmu_early_pull': "Seus cotovelos dobraram com o quadril {m} abaixo da barra; você puxou até ela, não em volta dela.",
  'cue.why.hips_low_transition': "Seu quadril chegou ao ponto mais alto {m} abaixo da barra; mire em cerca de 20 cm.",
  'cue.why.chicken_wing': "Seu cotovelo {side} passou a barra {m} depois do outro.",
  'cue.why.hspu_kip_timing': "Seus joelhos pararam {m} acima do quadril antes do chute, então o quadril não deu impulso.",
  'cue.why.hspu_banana': "Seu quadril ficou a {m} da parede no alto.",
  'cue.why.slow_turnover': "Você levou {m} da extensão completa até travar, então a barra já estava caindo antes de você estar embaixo dela.",
  'cue.why.bar_crash': "A barra caiu {m} do ponto mais alto antes de você travar os braços, então ela caiu em cima de você.",
  'cue.side.left': "esquerdo",
  'cue.side.right': "direito",
  'cue.side.late': "atrasado",
};
