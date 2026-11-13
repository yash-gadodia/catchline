import type { Strings } from '../types';
import type { capture as en } from '../en/capture';

export const capture: Strings<typeof en> = {
  'capture.checks.label.wholeBody': "Ganzer Körper im Bild",
  'capture.checks.label.sideOn': "Seitlich filmen",
  'capture.checks.label.light': "Gutes Licht",
  'capture.checks.hint.wholeBody': "Die Füße sind abgeschnitten. Stell das Handy weiter weg oder kipp es nach unten.",
  'capture.checks.hint.sideOn': "Dreh das Handy, damit du seitlich filmst, nicht von vorn.",
  'capture.checks.hint.light': "Es ist zu dunkel, um die Stange zu sehen. Stell dich zum Licht oder geh näher an eine Lampe.",
  'capture.hud.stopRecording': "Aufnahme stoppen",
  'capture.hud.record': "Aufnehmen",
  'capture.viewfinder.fps': "{fps} fps",
  'capture.viewfinder.tooLongTitle': "Über 30 Sekunden",
  'capture.viewfinder.tooLongBody': "Lange Videos brauchen länger. Stopp hier; schneiden kannst du auf dem nächsten Bildschirm.",
  'capture.viewfinder.getSet': "Bereit machen",
  'capture.viewfinder.liftWhenReady': "Los, wenn du bereit bist",
  'capture.viewfinder.stopAfterLast': "tippe auf Stopp, wenn du fertig bist",
  'capture.viewfinder.import': "Import",
  'capture.viewfinder.freeA11y': "{used} von {total} Gratis-Videos genutzt",
  'capture.viewfinder.storageTitle': "Speicher fast voll",
  'capture.viewfinder.storageBody': "Noch etwa {seconds} Sekunden Video mit {fps} fps. Catchline behält deine Analysen, die Originalvideos können weg.",
  'capture.viewfinder.deleteOriginals': { one: "{count} Originalvideo löschen, Analysen behalten", other: "{count} Originalvideos löschen, Analysen behalten" },
  'capture.viewfinder.recordAnyway': "Trotzdem aufnehmen",
  'capture.import.cancel': "Abbrechen",
  'capture.import.title': "Import",
  'capture.import.emptyTitle': "Kein Video ausgewählt",
  'capture.import.emptyBody': "Wähl einen Lift oder Turn-Clip mit dem ganzen Körper im Bild.",
  'capture.import.pick': "Video auswählen",
  'capture.import.record': "Lieber aufnehmen",
  'capture.import.failedTitle': "Das Video ließ sich nicht öffnen",
  'capture.import.failedBody': "Versuch es noch einmal oder wähl ein Video, das auf diesem Handy gespeichert ist.",
  'capture.mark.title': "Scheibe einkreisen",
  'capture.mark.back': "Zurück",
  'capture.mark.help': "Kreise die Scheibe ein, die der Kamera am nächsten ist. So weiß das Tracking, welcher Scheibe es folgen soll, und die Hantelbahn wird genauer.",
  'capture.mark.step1': "Drücke auf die Mitte der Scheibe",
  'capture.mark.step2': "Zieh bis zu ihrem Rand",
  'capture.mark.coachDrag': "Zieh bis zum Rand der Scheibe",
  'capture.mark.coachTap': "Ziehen, nicht tippen",
  'capture.mark.redo': "Markiert. Zum Ändern erneut drücken und ziehen.",
  'capture.mark.track': "Tracken",
  'capture.mark.skip': "Keine Scheibe? Überspringen",
  'capture.mark.stage': "Das erste Bild deines Clips. Drücke auf die Mitte der Scheibe und ziehe bis zum Rand.",
  'capture.trim.title': "Schneiden",
  'capture.trim.cancel': "Abbrechen",
  // REVIEW
  'capture.trim.help': "Tipp aufs Video zum Abspielen oder Pausieren, zieh die weiße Linie zu einem Bild. Zieh die Ränder zum Schneiden oder die Mitte zum Verschieben. ‹ und › springen eine Zehntelsekunde.",
  // REVIEW
  'capture.trim.window': "Schnittbereich. Zum Verschieben ziehen.",
  // REVIEW
  'capture.trim.startLabel': "Schnittanfang",
  // REVIEW
  'capture.trim.endLabel': "Schnittende",
  // REVIEW
  'capture.trim.earlier': "Früher",
  // REVIEW
  'capture.trim.later': "Später",
  // REVIEW
  'capture.trim.playhead': "Abspielposition",
  // REVIEW
  'capture.trim.play': "Abspielen",
  // REVIEW
  'capture.trim.pause': "Pausieren",
  // REVIEW
  'capture.trim.long': "Langes Video. Schneide auf den Lift zu, dann geht es schneller.",
  // REVIEW
  'capture.trim.tooLong': "Zu lang zum Erfassen. Kürze auf {max} s oder weniger.",
  'capture.viewfinder.framingGuide': "Ganzer Körper und Stange im Bild, Handy ruhig",
  'capture.trim.track': "Erfassen",
  'capture.trim.weightA11y': "Gewicht in {units}",
};
