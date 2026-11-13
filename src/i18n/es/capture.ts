import type { Strings } from '../types';
import type { capture as en } from '../en/capture';

export const capture: Strings<typeof en> = {
  'capture.checks.label.wholeBody': "Todo el cuerpo en el encuadre",
  'capture.checks.label.sideOn': "Graba de perfil",
  'capture.checks.label.light': "Buena luz",
  'capture.checks.hint.wholeBody': "Los pies quedan fuera. Aleja el teléfono o inclínalo hacia abajo.",
  'capture.checks.hint.sideOn': "Gira el teléfono para grabar de perfil, no de frente.",
  'capture.checks.hint.light': "Está demasiado oscuro para ver la barra. Ponte de cara a una luz o acércate a una.",
  'capture.hud.stopRecording': "Detener grabación",
  'capture.hud.record': "Grabar",
  'capture.viewfinder.fps': "{fps} fps",
  'capture.viewfinder.tooLongTitle': "Más de 30 segundos",
  'capture.viewfinder.tooLongBody': "Los vídeos largos tardan más. Para aquí; puedes recortarlo en la siguiente pantalla.",
  'capture.viewfinder.getSet': "Prepárate",
  'capture.viewfinder.liftWhenReady': "Empieza cuando quieras",
  'capture.viewfinder.stopAfterLast': "pulsa stop cuando termines",
  'capture.viewfinder.import': "Importar",
  'capture.viewfinder.freeA11y': "{used} de {total} vídeos gratis usados",
  'capture.viewfinder.storageTitle': "El almacenamiento está casi lleno",
  'capture.viewfinder.storageBody': "Quedan unos {seconds} segundos de vídeo a {fps} fps. Catchline conserva tus análisis; los vídeos originales se pueden borrar.",
  'capture.viewfinder.deleteOriginals': { one: "Borrar {count} vídeo original, conservar análisis", other: "Borrar {count} vídeos originales, conservar análisis" },
  'capture.viewfinder.recordAnyway': "Grabar igualmente",
  'capture.import.cancel': "Cancelar",
  'capture.import.title': "Importar",
  'capture.import.emptyTitle': "No has elegido ningún vídeo",
  'capture.import.emptyBody': "Elige cualquier levantamiento o clip de gimnasia con todo el cuerpo en el encuadre.",
  'capture.import.pick': "Elegir un vídeo",
  'capture.import.record': "Grabar en su lugar",
  'capture.import.failedTitle': "No se pudo abrir ese vídeo",
  'capture.import.failedBody': "Inténtalo de nuevo o elige un vídeo guardado en este teléfono.",
  'capture.mark.title': "Rodea el disco",
  'capture.mark.back': "Atrás",
  'capture.mark.help': "Rodea el disco más cercano a la cámara. Así el seguimiento sabe qué disco seguir y la trayectoria sale más precisa.",
  'capture.mark.step1': "Pulsa en el centro del disco",
  'capture.mark.step2': "Arrastra hasta su borde",
  'capture.mark.coachDrag': "Arrastra hasta el borde del disco",
  'capture.mark.coachRelease': "Suelta en el borde",
  'capture.mark.coachTap': "Arrastra, no toques",
  'capture.mark.redo': "Marcado. Pulsa y arrastra de nuevo para rehacerlo.",
  'capture.mark.track': "Seguir",
  'capture.mark.skip': "¿Sin disco? Omitir",
  'capture.mark.stage': "El primer fotograma de tu clip. Pulsa en el centro del disco y arrastra hasta el borde.",
  'capture.trim.title': "Recortar",
  'capture.trim.cancel': "Cancelar",
  // REVIEW
  'capture.trim.help': "Toca el vídeo para reproducir o pausar, arrastra la línea blanca hasta un fotograma. Arrastra los bordes para recortar o el centro para moverlo. ‹ y › avanzan una décima de segundo.",
  // REVIEW
  'capture.trim.window': "Zona de recorte. Arrástrala para moverla.",
  // REVIEW
  'capture.trim.startLabel': "Inicio del recorte",
  // REVIEW
  'capture.trim.endLabel': "Fin del recorte",
  // REVIEW
  'capture.trim.earlier': "Antes",
  // REVIEW
  'capture.trim.later': "Después",
  // REVIEW
  'capture.trim.playhead': "Cabezal",
  // REVIEW
  'capture.trim.play': "Reproducir",
  // REVIEW
  'capture.trim.pause': "Pausar",
  // REVIEW
  'capture.trim.long': "Vídeo largo. Recorta solo el levantamiento y irá más rápido.",
  // REVIEW
  'capture.trim.tooLong': "Demasiado largo para seguir. Recórtalo a {max} s o menos.",
  'capture.viewfinder.framingGuide': "Todo el cuerpo y la barra en el encuadre, teléfono quieto",
  'capture.trim.track': "Seguir",
  'capture.trim.weightA11y': "Peso en {units}",
};
