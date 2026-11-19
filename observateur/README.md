# Observateur

Un agent indépendant de l'agent PMO. Il observe comment tu travailles sur ton Mac et **accumule ce qu'il comprend** de toi, jour après jour :
- ton **rythme** : début, fin, temps devant le PC, concentration, dispersion, creux ;
- **quand tu ralentis, et pourquoi** : plantage, réseau, tâche difficile, manque de visibilité, fatigue, interruption, pause ;
- ton **environnement** : applications qui plantent, réseau coupé, redémarrages, réunions ;
- ton **style de mail** et les **erreurs** que tu fais : pièce jointe oubliée, pas en copie, sans salutation, fautes, demande sans échéance…

Ce qu'il écrit :
- **chaque soir à 18h35** (lundi au vendredi) : `jour-AAAA-MM-JJ.md` dans `~/Documents/Observateur`, avec ton rythme comparé à tes habitudes, les ralentissements expliqués, ton environnement, tes mails, ce qu'il a appris ou confirmé, et 3 conseils ;
- **le vendredi à 18h45** : `semaine-AAAA-MM-JJ.md` et ton **portrait de travail** réécrit (`~/.observateur/savoir/profil.md`).

## Le savoir est cumulable

Le journal brut (ce qui est noté toutes les 30 s) et les mails sont effacés après 30 jours. Ce qui en a été appris est gardé et s'enrichit dans `~/.observateur/savoir` :

| Fichier | Contenu |
|---|---|
| `jours.jsonl` | un résumé par jour : début, fin, temps devant le PC, concentration, dispersion, ralentissements et leur cause, plantages, mails |
| `constats.json` | ce que l'agent a compris de toi (comportement, environnement, style de mail, erreurs de mail), avec le nombre de fois où c'est revenu, la première et la dernière date, et des preuves |
| `notes.jsonl` | ce que tu lui dis toi-même ; ça l'emporte sur ses déductions |
| `profil.md` | ton portrait, réécrit chaque vendredi à partir de tout cela |

Chaque soir, tes repères habituels (médianes des 20 derniers jours, et du même jour de la semaine) servent à dire si la journée est normale. Un constat qui revient gagne une occurrence : ce qui est solide se distingue de ce qui est une hypothèse.

**Pour lui apprendre**, quand tu sais pourquoi tu as ralenti ou qu'il s'est trompé :

```bash
node observateur/analyse.mjs note "14h30 : Teams a planté pendant la réunion"
node observateur/analyse.mjs note "mardi : fatigué, nuit courte"
node observateur/analyse.mjs note "ce n'était pas un manque de visibilité, j'attendais Hicham au téléphone"
```

## Comment il explique un ralentissement

Le code repère les quarts d'heure où ton activité tombe sous 50 % (hors réunions). Pour chacun, il relève les signaux :
- un plantage ou un redémarrage à moins de 10 minutes ;
- une coupure réseau ;
- le Mac en veille ;
- des changements d'application nombreux entre emails et messagerie ;
- un même sujet ouvert depuis longtemps ;
- l'heure et le temps écoulé depuis le début de la journée.

Il en tire une première hypothèse par règle :

| Signal dominant | Hypothèse |
|---|---|
| plantage ou redémarrage | plantage |
| réseau coupé | réseau |
| Mac en veille, rien d'actif | pause |
| va-et-vient emails et messagerie | manque de visibilité |
| longtemps sur le même sujet | tâche difficile |
| tard, ou creux d'après-déjeuner | fatigue |

Claude confirme ou corrige chaque hypothèse avec tes habitudes et tes notes, et donne un niveau de confiance.

## Ce qu'il regarde, et ce qu'il ne regarde pas

**Toutes les 30 secondes**, il note :
- l'application au premier plan ;
- le titre de sa fenêtre ;
- le **domaine** de l'onglet si c'est un navigateur ;
- les secondes depuis ta dernière action clavier ou souris ;
- les plantages d'applications (rapports macOS de `~/Library/Logs/DiagnosticReports`) ;
- une coupure réseau, un redémarrage du Mac.

**Chaque soir**, il lit dans Apple Mail les messages **envoyés** du jour : objet, heure, nombre et domaines des destinataires, pièces jointes, et ton texte sans l'historique cité.

Il ne fait **pas** de capture d'écran, n'enregistre **pas** la frappe clavier, et ne lit **pas** le contenu des documents ni les mails reçus.

**Ce qui est retiré ou caché :**
- dans les titres et les mails, les adresses email, les numéros, les IP, les liens et les jetons sont retirés avant tout enregistrement ;
- les gestionnaires de mots de passe et la banque n'ont aucun titre enregistré.

**Ce qui part vers Claude**, par ta propre commande `claude` (ton abonnement) :
- les mesures du jour ;
- le texte masqué de 15 mails envoyés au plus ;
- tes constats et tes notes.

Avec `--sans-claude`, rien ne part. Avec `--sans-mails`, Apple Mail n'est pas lu. `"mails": {"actif": false}` coupe la lecture des mails pour de bon.

**Avant de l'utiliser sur un poste ou des données d'inwi**, vérifie que c'est compatible avec la politique de la DSI : les titres et tes mails citent des sujets du projet.

## Le bon modèle pour chaque étape

| Étape | Qui |
|---|---|
| Collecte, masquage, statistiques, repères, ralentissements candidats et leurs signaux, contrôles des mails | le code, sans modèle |
| Explications, constats du jour, style et erreurs de mail, conseils | `claude-sonnet-5-5` |
| Portrait de la semaine | `claude-opus-5-5` |

## Installation (une fois)

Il faut **Node.js 20 ou plus récent**, et **Claude Code** connecté à ton compte (la commande `claude`) pour les explications et le savoir. Sans Claude Code, les rapports n'ont que les mesures et les hypothèses par règle.

```bash
cd ai-ready && git pull
bash observateur/install.sh
```

Ensuite, dans **Réglages Système → Confidentialité et sécurité** :
1. **Accessibilité** : autorise `node`. Sans cela, les titres de fenêtres restent vides.
2. **Automatisation** : quand macOS le demande, autorise `node` à piloter **Safari ou Chrome** (pour le domaine de l'onglet) et **Mail** (pour tes mails envoyés).

Pour essayer tout de suite, après quelques minutes d'activité :

```bash
node observateur/analyse.mjs jour --sans-claude     # mesures seules
node observateur/analyse.mjs jour                   # avec explications, savoir et conseils
node observateur/analyse.mjs semaine                # synthèse et portrait
```

## Réglages

`~/.observateur/config.json` est copié de `config.example.json` à l'installation :

| Réglage | Rôle |
|---|---|
| `heures_de_travail` | heures et jours ouvrés |
| `objectifs` | tes règles (concentration, créneaux emails, dispersion) ; les conseils s'y comparent |
| `categories` | applications et domaines rangés en Emails, Réunions, Messagerie, Documents, Claude, Outils projet, Agenda, Web |
| `ralentissement` | durée des fenêtres (15 min) et seuil d'activité (50 %) |
| `mails` | tes adresses (pour vérifier que tu es en copie), salutations attendues, mots à éviter |
| `ignorer_apps`, `masquer_titre_apps` | ce qui n'est pas enregistré, ou enregistré sans titre |
| `conservation_jours` | durée de conservation du journal brut et des mails (le savoir est gardé) |

## Arrêter

```bash
bash observateur/uninstall.sh       # arrête les trois agents ; journal, savoir et rapports gardés
```

Tests : `npm run test:observateur`.
