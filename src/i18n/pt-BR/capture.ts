import type { Strings } from '../types';
import type { capture as en } from '../en/capture';

export const capture: Strings<typeof en> = {
  'capture.checks.label.wholeBody': "Corpo inteiro no quadro",
  'capture.checks.label.sideOn': "Filme de lado",
  'capture.checks.label.light': "Boa luz",
  'capture.checks.hint.wholeBody': "Os pés estão cortados. Afaste o celular ou incline-o para baixo.",
  'capture.checks.hint.sideOn': "Gire o celular para filmar de lado, não de frente.",
  'capture.checks.hint.light': "Está escuro demais para ver a barra. Fique de frente para uma luz ou chegue mais perto de uma.",
  'capture.hud.stopRecording': "Parar gravação",
  'capture.hud.record': "Gravar",
  'capture.viewfinder.fps': "{fps} fps",
  'capture.viewfinder.tooLongTitle': "Mais de 30 segundos",
  'capture.viewfinder.tooLongBody': "Vídeos longos demoram mais. Pare aqui; dá para cortar na próxima tela.",
  'capture.viewfinder.getSet': "Prepare-se",
  'capture.viewfinder.liftWhenReady': "Vai quando estiver pronto",
  'capture.viewfinder.stopAfterLast': "toque em parar quando terminar",
  'capture.viewfinder.import': "Importar",
  'capture.viewfinder.freeA11y': "{used} de {total} vídeos grátis usados",
  'capture.viewfinder.storageTitle': "O armazenamento está quase cheio",
  'capture.viewfinder.storageBody': "Restam cerca de {seconds} segundos de vídeo a {fps} fps. O Catchline mantém suas análises; os vídeos originais podem ser apagados.",
  'capture.viewfinder.deleteOriginals': { one: "Apagar {count} vídeo original, manter as análises", other: "Apagar {count} vídeos originais, manter as análises" },
  'capture.viewfinder.recordAnyway': "Gravar mesmo assim",
  'capture.import.cancel': "Cancelar",
  'capture.import.title': "Importar",
  'capture.import.emptyTitle': "Nenhum vídeo escolhido",
  'capture.import.emptyBody': "Escolha qualquer levantamento ou clipe de ginástica com o corpo inteiro no quadro.",
  'capture.import.pick': "Escolher um vídeo",
  'capture.import.record': "Gravar em vez disso",
  'capture.import.failedTitle': "Não foi possível abrir esse vídeo",
  'capture.import.failedBody': "Tente de novo ou escolha um vídeo salvo neste celular.",
  'capture.mark.title': "Marque a anilha",
  'capture.mark.back': "Voltar",
  'capture.mark.help': "Pressione no centro da anilha mais próxima da câmera e arraste até a borda. Assim o rastreamento sabe qual anilha seguir e a trajetória sai mais precisa.",
  'capture.mark.redo': "Marcado. Pressione e arraste de novo para refazer.",
  'capture.mark.track': "Rastrear",
  'capture.mark.skip': "Pular, encontre a anilha para mim",
  'capture.mark.stage': "O primeiro quadro do seu clipe. Pressione no centro da anilha e arraste até a borda.",
  'capture.trim.title': "Cortar",
  'capture.trim.cancel': "Cancelar",
  // REVIEW
  'capture.trim.help': "Toque no vídeo para reproduzir ou pausar, arraste a linha branca até um quadro. Arraste as bordas para cortar ou o meio para mover. ‹ e › andam um décimo de segundo.",
  // REVIEW
  'capture.trim.window': "Área de corte. Arraste para mover.",
  // REVIEW
  'capture.trim.startLabel': "Início do corte",
  // REVIEW
  'capture.trim.endLabel': "Fim do corte",
  // REVIEW
  'capture.trim.earlier': "Antes",
  // REVIEW
  'capture.trim.later': "Depois",
  // REVIEW
  'capture.trim.playhead': "Cursor de reprodução",
  // REVIEW
  'capture.trim.play': "Reproduzir",
  // REVIEW
  'capture.trim.pause': "Pausar",
  // REVIEW
  'capture.trim.long': "Vídeo longo. Corte só o levantamento e vai mais rápido.",
  // REVIEW
  'capture.trim.tooLong': "Longo demais para rastrear. Corte para {max} s ou menos.",
  'capture.viewfinder.framingGuide': "Corpo inteiro e barra no quadro, celular parado",
  'capture.trim.track': "Rastrear",
  'capture.trim.weightA11y': "Peso em {units}",
};
