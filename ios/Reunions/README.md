# Réunions : enregistrement et transcription darija / français sur iPhone

Application iOS (iPhone, iOS 17+) qui enregistre une réunion et la transcrit **hors ligne, sur le téléphone**, avec Whisper large-v3 turbo ([WhisperKit](https://github.com/argmaxinc/argmax-oss-swift)). L'audio ne quitte pas l'iPhone.

Le compte rendu n'est pas généré dans l'app. On copie la transcription (bouton « Copier pour Claude ») et on la colle dans la conversation Claude du projet. Claude prépare le CR, les mises à jour du suivi et les points à vérifier.

## Ce que fait l'app

- **Enregistrement** en AAC 16 kHz mono (environ 30 Mo par heure).
  - Continue écran verrouillé et reprend après un appel.
  - Marqueurs « Décision », « Action » et « Point » posés pendant la réunion.
- **Import** d'un audio existant : export Plaud, Dictaphone, WhatsApp.
- **Transcription par tranches de 30 s.**
  - En mode Auto, chaque tranche est transcrite en français ou en arabe/darija, selon la langue qui y domine. Whisper seul ne choisit qu'une langue par fichier.
  - Une amorce de vocabulaire (Phénix, EB25, Wallix, noms…) améliore l'écriture des noms et sigles. Elle se modifie dans Réglages.
  - La progression est sauvegardée à chaque tranche, ce qui permet de reprendre après une interruption.
- **Export** de deux façons :
  - texte horodaté avec la langue de chaque paragraphe (partage) ;
  - version « pour Claude » avec la consigne de CR.
- **Stockage** : les fichiers sont dans *Fichiers › Sur mon iPhone › Réunions › Meetings*.

## Installer sur ton iPhone (une fois, environ 20 min)

Il te faut un Mac avec Xcode 16 ou plus récent (App Store), et ton iPhone 15 Pro avec un câble.

```bash
brew install xcodegen
cd ai-ready/ios/Reunions
xcodegen                      # génère Reunions.xcodeproj
open Reunions.xcodeproj
```

Dans Xcode :

1. Sélectionne la cible **Reunions**, onglet *Signing & Capabilities*, puis **Team** : ton Apple ID (*Add an Account…* si besoin, l'équipe « Personal Team » suffit). Si Xcode signale que l'identifiant est pris, change `com.issamsedki.reunions` en un autre identifiant unique.
2. Branche l'iPhone et choisis-le comme destination en haut de la fenêtre.
3. Sur l'iPhone, active *Réglages › Confidentialité et sécurité › Mode développeur*. L'iPhone redémarre.
4. Clique sur **Run** (▶). Au premier lancement, autorise le développeur dans *Réglages › Général › VPN et gestion de l'appareil*.

Le premier build télécharge WhisperKit (Swift Package), ce qui prend quelques minutes.

**Avec un Apple ID gratuit, l'app expire au bout de 7 jours.** Il faut alors la relancer depuis Xcode. Un compte Apple Developer (99 $/an) supprime cette limite et permet TestFlight.

## Premier usage

1. **En Wi-Fi**, importe ou enregistre un court audio, puis appuie sur *Transcrire*. L'app télécharge le modèle depuis Hugging Face (environ 600 Mo, une seule fois) et le compile pour le Neural Engine. La première transcription est donc plus lente.
2. Fais un test sur 10 minutes d'une vraie réunion qui mélange darija et français. Utilise *Retranscrire avec…* pour comparer Auto, Français et Arabe, et garde le réglage qui restitue le mieux les décisions, dates et noms.
3. Pendant la transcription, **garde l'app ouverte** : l'écran reste allumé automatiquement, et iOS suspend les apps en arrière-plan. Compte environ un tiers à la moitié de la durée de la réunion. C'est une estimation, à confirmer sur ton iPhone.

## Limites connues

- **Darija** : Whisper n'a pas été entraîné spécifiquement sur le darija. Les passages en darija sont souvent approximatifs ou écrits en arabe standard. Les décisions et dates passent généralement ; le mot à mot, non. Une phrase de récap en français en fin de réunion reste le meilleur filet de sécurité.
- **Code non compilé ici.** Il a été écrit d'après l'API publiée de WhisperKit (argmax-oss-swift 1.x), mais il n'a pas pu être compilé dans l'environnement où il a été écrit, qui n'a pas de Mac. Si Xcode signale une erreur, envoie le message : c'est en général une ligne à ajuster. Point le plus probable : `tokenizer.specialTokens.specialTokenBegin` dans `Transcriber.swift`. Si ce nom n'existe pas, remplace le filtre par `{ $0 < 50257 }`.
- **Nom du modèle** : `large-v3-v20240930_626MB` est le modèle recommandé par Argmax pour iPhone. Si le téléchargement échoue, choisis l'autre modèle dans Réglages.

## Fichiers

| Fichier | Rôle |
|---|---|
| `project.yml` | Définition du projet pour XcodeGen (cible, Info.plist, dépendance WhisperKit) |
| `Sources/ReunionsApp.swift` | Point d'entrée, réglages par défaut (modèle, vocabulaire, langue) |
| `Sources/MeetingStore.swift` | Modèle de données et stockage (un dossier par réunion) |
| `Sources/Recorder.swift` | Enregistrement, pause, marqueurs, reprise après appel |
| `Sources/Transcriber.swift` | Transcription WhisperKit par tranches de 30 s avec langue par tranche |
| `Sources/Export.swift` | Paragraphes, texte partagé, version « pour Claude » |
| `Sources/*View.swift` | Écrans : liste, enregistrement, détail, réglages |
