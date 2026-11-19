# Observateur

Un agent indépendant de l'agent PMO, qui fonctionne comme un **audit continu du travail d'une personne dans un rôle donné**. Il suit son travail au quotidien, comme un *gemba walk*, pour comprendre :
- comment elle travaille ;
- ce qu'elle fait bien ;
- ce qui la bloque : lenteurs, frustrations, répétitions, erreurs.

Il confie ensuite ce qu'il a compris à une **équipe d'agents**. Cette équipe propose des outils qui existent déjà, ou écrit la spec d'un **add-on** à développer. Ces propositions sont publiées sur GitHub. Une fois installées, leur effet est mesuré.

```
observer (Mac, toutes les 30 s)  →  comprendre (chaque soir)  →  proposer (le vendredi)  →  installer  →  mesurer
                ↑                                                                                        │
                └───────────────────────── la friction d'origine est suivie semaine après semaine ────────┘
```

Le but est d'outiller la personne, jamais de l'évaluer.

## 1. La fiche d'audit

`~/.observateur/profil.json` (modèle : `profil.example.json`) décrit le rôle observé :
- missions, livrables et outils attendus ;
- interlocuteurs et contraintes (poste d'entreprise, validation par la DSI) ;
- ce que la personne veut améliorer.

Elle dit aux agents ce qui est normal pour ce rôle. Trois heures d'emails peuvent être le cœur du métier ou une perte de temps : c'est la fiche qui permet de trancher.

## 2. L'observation continue

**Toutes les 30 secondes**, le collecteur note :
- l'application au premier plan ;
- le titre de sa fenêtre ;
- le domaine de l'onglet s'il s'agit d'un navigateur ;
- les secondes depuis la dernière action ;
- les plantages d'applications, une coupure réseau, un redémarrage.

Il ne fait pas de capture d'écran, n'enregistre pas la frappe et ne lit pas le contenu des documents.

**Chaque soir :**
- **18h25 · la question du soir.** Une seule question, courte et précise, dans une fenêtre macOS, sur le moment le plus marquant de la journée. Par exemple : « À 14:20 : Microsoft Excel a planté, 8 min d'inactivité ensuite. Qu'est-ce qui se passait ? ». Ta réponse devient une note, qui fait foi.
- **18h35 · le rapport du jour**, `jour-AAAA-MM-JJ.md` :
  - ton rythme comparé à tes habitudes ;
  - les ralentissements et leur cause probable ;
  - ton environnement ;
  - tes **fils de travail** : temps, reprises et outils par dossier (CreditSet, A-043…) ;
  - les **signes de frustration** : va-et-vient entre deux applications, même fenêtre reprise en boucle, arrêt après un plantage ;
  - les **enchaînements répétés** (Excel → Mail → Teams…) ;
  - tes mails envoyés : style et erreurs ;
  - ce qu'il a appris ;
  - 3 conseils.
- **Le vendredi à 18h45 :** ton portrait de travail est réécrit.

Le **savoir s'accumule** dans `~/.observateur/savoir` :

| Fichier | Contenu |
|---|---|
| `jours.jsonl` | un résumé par jour |
| `constats.json` | ce qui est compris, avec le nombre de fois où c'est revenu et des preuves |
| `notes.jsonl` | tes notes, qui l'emportent sur les déductions |
| `profil.md` | ton portrait |

Le journal brut est effacé après 30 jours ; ce savoir est gardé.

## 3. L'équipe d'agents (vendredi 18h55)

| Agent | Rôle | Modèle |
|---|---|---|
| Analyste processus | reconstitue les fils de travail de la semaine et les gaspillages (attente, dispersion, retravail, double saisie, recherche d'information, interruptions, outil défaillant), avec preuves et temps par semaine | Sonnet |
| Analyste frictions | liste les frictions (lenteur, frustration, répétition, erreur, attente, dispersion, outil) avec leur cause, leur fréquence et le temps perdu ; garde le même identifiant d'une semaine à l'autre | Sonnet |
| Chercheur d'outils | cherche d'abord ce qui existe : réglage, raccourci ou automatisation macOS, règle Mail ou Outlook, application, extension, skill ou agent Claude, l'agent PMO, une méthode. Recherche web pour vérifier l'existence, le **prix et la licence** ; gratuit ou faible coût d'abord ; marque ce que la DSI doit valider | Sonnet + recherche web |
| Architecte add-on | quand rien n'existe, écrit la spec : problème chiffré, scénario d'usage, fonctionnement, données et confidentialité, intégration, effort, **critère de succès mesurable par l'Observateur**, risques | Opus |
| Critique | classe par gain, effort et coût, écarte ce qui n'est pas réaliste ou risqué pour la confidentialité, choisit le top 5 | Opus |

Seules les frictions de 30 minutes perdues par semaine ou plus sont traitées, ainsi que toutes les erreurs. Le seuil se règle dans `config.json`.

Ce que l'équipe produit :
- `~/Documents/Observateur/equipe-AAAA-MM-JJ.md` ;
- le backlog `~/.observateur/equipe/opportunites.json` ;
- les specs dans `~/.observateur/equipe/specs/` ;
- une **issue GitHub** par opportunité du top 5.

### Le cycle de vie d'une opportunité

| Statut | Signification |
|---|---|
| `proposee` | publiée, avec la mesure de départ de sa friction (minutes perdues par semaine) |
| `acceptee` | tu veux l'essayer |
| `installee` | à partir de là, chaque vendredi mesure à nouveau la friction : le rapport affiche **avant → après** |
| `rejetee` | écartée |

```bash
node observateur/equipe.mjs liste
node observateur/equipe.mjs statut attente-acces installee "règle Mail créée"
node observateur/equipe.mjs semaine        # relancer l'équipe à la main
node observateur/equipe.mjs publier        # republier ce qui n'a pas pu l'être
```

### Publication sur GitHub

- **Jeton :** `gh auth login`, ou la variable `GITHUB_TOKEN`.
- **Dépôt :** `equipe.github.depot` dans la config (par défaut `isedki/ai-ready`), label `observateur`.
- **Dépôt public :** la publication est **refusée** si le dépôt est public, sauf si tu l'autorises (`depot_public_autorise`).
- **Contenu d'une issue :** seulement une synthèse anonymisée (friction, gain, effort, coût, mesure de départ, recommandation, spec). Jamais de titres de fenêtres, de mails ni de noms.
- **Si GitHub est injoignable** (réseau de l'entreprise), rien n'est perdu : la publication est retentée au passage suivant, ou avec `equipe.mjs publier` depuis un autre réseau.

## Ce qui part, et où

| Donnée | Reste sur le Mac | Part vers Claude (ta commande `claude`) | Part vers GitHub |
|---|---|---|---|
| Journal (apps, titres masqués, inactivité, environnement) | oui, 30 jours | en résumé statistique | non |
| Mails envoyés (texte masqué) | oui, 30 jours | 15 au plus par jour, pour le style et les erreurs | non |
| Savoir, notes, fiche d'audit | oui | oui | non |
| Frictions et opportunités | oui | oui | synthèse anonymisée du top 5 |
| Recherche web du chercheur d'outils | — | description générique de la friction | — |

`--sans-claude` et `--sans-mails` sur l'analyse du jour ; `"recherche_web": false` et `"publier": false` dans `equipe`.

Pour observer quelqu'un d'autre que toi : consentement explicite, et validation de la DSI et de la CNDP avant de commencer.

## Installation sur macOS

Il faut **Node.js 20 ou plus récent**, et **Claude Code** connecté à ton compte (`claude`). En option : **`gh`**, connecté avec `gh auth login`, pour publier sur GitHub.

```bash
cd ai-ready && git pull          # ou dézippe observateur.zip
bash observateur/install.sh
```

Ensuite :
1. Dans Réglages Système → Confidentialité et sécurité :
   - **Accessibilité** : autorise `node`.
   - **Automatisation** : quand macOS le demande, autorise `node` à piloter Safari ou Chrome, Mail et System Events (pour la fenêtre de la question du soir).
2. Complète ta fiche d'audit : `~/.observateur/profil.json`.

L'installation crée cinq tâches de fond (launchd, utilisateur courant, sans droits administrateur) :

| Tâche | Quand |
|---|---|
| collecte | toutes les 30 s |
| question du soir | 18h25 |
| rapport du jour | 18h35 |
| portrait | vendredi 18h45 |
| équipe d'agents | vendredi 18h55 |

Pour essayer tout de suite :

```bash
node observateur/analyse.mjs jour --sans-claude
node observateur/question.mjs
node observateur/analyse.mjs note "14h30 : Teams a planté pendant la réunion"
```

Pour arrêter : `bash observateur/uninstall.sh`. Les données sont gardées.

Tests : `npm run test:observateur`.
