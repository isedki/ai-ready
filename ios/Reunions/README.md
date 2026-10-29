# Réunions : enregistrement et transcription darija / français sur iPhone

Application iOS (iPhone, iOS 17+) qui enregistre une réunion et la transcrit **hors ligne, sur le téléphone**, avec Whisper large-v3 turbo ([WhisperKit](https://github.com/argmaxinc/argmax-oss-swift)). L'audio ne quitte pas l'iPhone.

Le compte rendu n'est pas généré dans l'app. On copie la transcription (bouton « Copier pour Claude ») et on la colle dans la conversation Claude du projet. Claude prépare le CR, les mises à jour du suivi et les points à vérifier.

**Aucun Mac n'est nécessaire.** L'app est construite dans le cloud par GitHub Actions (un Mac loué à la minute), puis installée sur l'iPhone via TestFlight.

## Ce que fait l'app

- **Enregistrement** en AAC 16 kHz mono (environ 30 Mo par heure).
  - Continue écran verrouillé et reprend après un appel.
  - Marqueurs « Décision », « Action » et « Point » posés pendant la réunion.
- **Import** d'un audio existant : export Plaud, Dictaphone, WhatsApp.
- **Transcription** par tranches d'environ 30 s, coupées sur un silence et non au milieu d'un mot.
  - En mode Auto, chaque tranche est transcrite en français ou en arabe/darija, selon la langue qui y domine.
- **Jargon Phénix** (`Sources/Glossary.swift`), utilisé de trois façons :
  1. **Amorce Whisper** : contexte du projet, sigles prioritaires (EB25, BSCS, APIGEE, Wallix, VABF, MGEN…) et **participants de la réunion**, saisis à l'enregistrement.
  2. **Corrections automatiques** des erreurs d'écoute fréquentes, par exemple « Wallis » → Wallix, « a pigée » → APIGEE, « in wi » → inwi, « crédit set » → CreditSet, « Boudrika » → Boudriga. Ajoute chaque erreur récurrente dans `corrections`.
  3. **Glossaire complet** (systèmes, termes projet, sociétés, une quarantaine de personnes) joint à la version « pour Claude », pour que Claude corrige le reste.
- **Export** de deux façons :
  - texte horodaté avec la langue de chaque paragraphe ;
  - version « pour Claude » avec consigne et glossaire.

## Mise en place dans le cloud (une fois)

**Coût** : 99 $/an pour l'Apple Developer Program, obligatoire pour TestFlight. Les builds GitHub sur Mac utilisent environ 15 à 20 min chacun. Le forfait gratuit d'un dépôt privé en couvre une dizaine par mois (les minutes macOS comptent ×10). Au-delà, quelques centimes la minute.

1. **Apple Developer Program** : inscription sur developer.apple.com (99 $/an). Note ton **Team ID** (Membership).
2. **App Store Connect**, dans un navigateur :
   1. *Apps › + › Nouvelle app* : iOS, nom « Réunions », langue Français, identifiant de bundle `com.issamsedki.reunions`. S'il n'apparaît pas dans la liste, crée-le d'abord dans *Certificates, Identifiers & Profiles › Identifiers*.
   2. *Utilisateurs et accès › Intégrations › Clés API App Store Connect* : crée une clé avec le rôle **Admin**, qui permet à Apple de créer le certificat de signature. Télécharge le fichier `.p8`, qui ne se télécharge qu'une fois. Note le **Key ID** et l'**Issuer ID**.
3. **GitHub**, dépôt `isedki/ai-ready`, *Settings › Secrets and variables › Actions* :
   - **Secrets** : `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (colle tout le contenu du fichier `.p8`).
   - **Variables** : `IOS_TESTFLIGHT` = `on`.
4. **Lancer un build** : *Actions › iOS TestFlight › Run workflow*. Ensuite, chaque modification de `ios/Reunions/` relance un build automatiquement.
5. **Sur l'iPhone** : installe l'app **TestFlight** depuis l'App Store. Dans App Store Connect, *TestFlight › Testeurs internes*, ajoute-toi. L'app « Réunions » apparaît dans TestFlight après le traitement Apple, environ 10 à 30 min ; installe-la.

Un build TestFlight reste installable 90 jours. Chaque nouveau build le remplace.

### Si le build échoue

Ouvre le run dans *Actions* et copie-colle l'erreur dans la conversation Claude. Le code n'a pas pu être compilé là où il a été écrit, qui n'a pas de Mac : une ou deux corrections sont possibles au premier build. Le point le plus probable est `tokenizer.specialTokens.specialTokenBegin` dans `Transcriber.swift` ; à défaut, remplace le filtre par `{ $0 < 50257 }`.

## Premier usage

1. **En Wi-Fi**, importe ou enregistre un court audio, puis appuie sur *Transcrire*. L'app télécharge le modèle (environ 600 Mo, une seule fois).
2. Saisis les **participants** à chaque réunion : ce sont les noms qui gagnent le plus en précision.
3. Test sur 10 minutes d'une vraie réunion darija / français. Utilise *Retranscrire avec…* pour comparer Auto, Français et Arabe.
4. Pendant la transcription, **garde l'app ouverte** (l'écran reste allumé). Compte environ un tiers à la moitié de la durée de la réunion, estimation à confirmer.

## Limites

- **Darija** : Whisper n'a pas été entraîné spécifiquement sur le darija. Ces passages restent approximatifs ; les décisions, dates et noms passent mieux. Une phrase de récap en français en fin de réunion reste le meilleur filet de sécurité.
- **Les corrections automatiques** ne touchent que les passages en français et les erreurs listées. Les autres sont corrigées par Claude avec le glossaire.

## Option : construire sur un Mac

`brew install xcodegen && cd ios/Reunions && xcodegen && open Reunions.xcodeproj`. Ensuite, dans Xcode : *Signing* (ton Apple ID), puis *Run* vers l'iPhone branché.

## Fichiers

| Fichier | Rôle |
|---|---|
| `project.yml` | Définition du projet pour XcodeGen (cible, Info.plist, WhisperKit) |
| `../../.github/workflows/ios-testflight.yml` | Build cloud et envoi sur TestFlight |
| `Sources/Glossary.swift` | Jargon Phénix : amorce, corrections, glossaire pour Claude |
| `Sources/Transcriber.swift` | Transcription par tranches coupées sur les silences, langue par tranche |
| `Sources/Recorder.swift` | Enregistrement, pause, marqueurs, reprise après appel |
| `Sources/MeetingStore.swift` | Données et stockage (un dossier par réunion) |
| `Sources/Export.swift` | Texte partagé et version « pour Claude » |
| `Sources/*View.swift` | Écrans : liste, enregistrement, détail, réglages |
