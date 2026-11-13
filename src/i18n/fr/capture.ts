import type { Strings } from '../types';
import type { capture as en } from '../en/capture';

export const capture: Strings<typeof en> = {
  'capture.checks.label.wholeBody': "Tout le corps dans le cadre",
  'capture.checks.label.sideOn': "Filme de profil",
  'capture.checks.label.light': "Bonne lumière",
  'capture.checks.hint.wholeBody': "Les pieds sont coupés. Recule le téléphone ou incline-le vers le bas.",
  'capture.checks.hint.sideOn': "Tourne le téléphone pour filmer de profil, pas de face.",
  'capture.checks.hint.light': "Il fait trop sombre pour voir la barre. Mets-toi face à une lumière ou rapproche-toi d'une source.",
  'capture.hud.stopRecording': "Arrêter l'enregistrement",
  'capture.hud.record': "Enregistrer",
  'capture.viewfinder.fps': "{fps} fps",
  'capture.viewfinder.tooLongTitle': "Plus de 30 secondes",
  'capture.viewfinder.tooLongBody': "Les longues vidéos prennent plus de temps. Arrête-toi ici ; tu pourras couper à l'écran suivant.",
  'capture.viewfinder.getSet': "Prépare-toi",
  'capture.viewfinder.liftWhenReady': "Vas-y quand tu es prêt",
  'capture.viewfinder.stopAfterLast': "appuie sur stop quand tu as fini",
  'capture.viewfinder.import': "Importer",
  'capture.viewfinder.freeA11y': "{used} vidéos gratuites utilisées sur {total}",
  'capture.viewfinder.storageTitle': "Stockage presque plein",
  'capture.viewfinder.storageBody': "Il reste environ {seconds} secondes de vidéo à {fps} fps. Catchline garde tes analyses ; les vidéos originales peuvent partir.",
  'capture.viewfinder.deleteOriginals': { one: "Supprimer {count} vidéo originale, garder les analyses", other: "Supprimer {count} vidéos originales, garder les analyses" },
  'capture.viewfinder.recordAnyway': "Enregistrer quand même",
  'capture.import.cancel': "Annuler",
  'capture.import.title': "Importer",
  'capture.import.emptyTitle': "Aucune vidéo choisie",
  'capture.import.emptyBody': "Choisis n'importe quel mouvement, barre ou gym, avec tout le corps dans le cadre.",
  'capture.import.pick': "Choisir une vidéo",
  'capture.import.record': "Filmer plutôt",
  'capture.import.failedTitle': "Impossible d'ouvrir cette vidéo",
  'capture.import.failedBody': "Réessaie, ou choisis une vidéo enregistrée sur ce téléphone.",
  'capture.mark.title': "Entoure le disque",
  'capture.mark.back': "Retour",
  'capture.mark.help': "Entoure le disque le plus proche de la caméra. Le suivi sait ainsi quel disque suivre, et la trajectoire est plus précise.",
  'capture.mark.step1': "Appuie au centre du disque",
  'capture.mark.step2': "Glisse jusqu'à son bord",
  'capture.mark.redo': "Marqué. Appuie et fais glisser à nouveau pour refaire.",
  'capture.mark.track': "Suivre",
  'capture.mark.skip': "Pas de disque ? Passer",
  'capture.mark.stage': "La première image de ton clip. Appuie au centre du disque et fais glisser jusqu'au bord.",
  'capture.trim.title': "Couper",
  'capture.trim.cancel': "Annuler",
  // REVIEW
  'capture.trim.help': "Touche la vidéo pour lire ou mettre en pause, fais glisser la ligne blanche jusqu’à une image. Fais glisser les bords pour couper, ou le milieu pour déplacer. ‹ et › avancent d’un dixième de seconde.",
  // REVIEW
  'capture.trim.window': "Zone de coupe. Fais-la glisser pour la déplacer.",
  // REVIEW
  'capture.trim.startLabel': "Début de la coupe",
  // REVIEW
  'capture.trim.endLabel': "Fin de la coupe",
  // REVIEW
  'capture.trim.earlier': "Plus tôt",
  // REVIEW
  'capture.trim.later': "Plus tard",
  // REVIEW
  'capture.trim.playhead': "Tête de lecture",
  // REVIEW
  'capture.trim.play': "Lire",
  // REVIEW
  'capture.trim.pause': "Pause",
  // REVIEW
  'capture.trim.long': "Longue vidéo. Coupe autour du mouvement, le suivi ira plus vite.",
  // REVIEW
  'capture.trim.tooLong': "Trop long pour le suivi. Coupe à {max} s ou moins.",
  'capture.viewfinder.framingGuide': "Tout le corps et la barre dans le cadre, téléphone immobile",
  'capture.trim.track': "Suivre",
  'capture.trim.weightA11y': "Poids en {units}",
};
