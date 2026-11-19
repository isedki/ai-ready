# Observateur

Un agent indépendant de l'agent PMO. Il regarde comment tu travailles sur ton Mac et écrit un fichier pour t'aider à t'organiser :
- **chaque soir à 18h35** (lundi au vendredi) : un rapport court avec 3 conseils pour le lendemain ;
- **le vendredi à 18h45** : la synthèse de la semaine (tendances, 5 changements classés par gain, tâches à confier à un agent).

## Ce qu'il regarde, et ce qu'il ne regarde pas

Toutes les 30 secondes, il note :
- l'application au premier plan ;
- le titre de sa fenêtre (objet du mail, nom du fichier, titre de la réunion) ;
- pour un navigateur, le **domaine** de l'onglet (`mail.google.com`), jamais l'adresse complète ;
- si tu es inactif (plus de 2 minutes sans clavier ni souris).

Pas de capture d'écran, pas de frappe clavier, pas de contenu de document.

Avant d'écrire, il retire des titres les adresses email, les numéros de téléphone, les IP, les liens et les jetons. Les applications de `masquer_titre_apps` (gestionnaires de mots de passe, banque) n'ont aucun titre enregistré. Celles de `ignorer_apps` ne sont pas enregistrées du tout.

Le journal reste sur le Mac, dans `~/.observateur/journal`, un fichier par jour lisible seulement par toi. Il est effacé après 30 jours. Pour les conseils, seul le résumé du jour part vers Claude, par ta propre commande `claude` : temps par catégorie, blocs de concentration, changements d'application, sujets d'après les titres déjà masqués. Avec `--sans-claude`, rien ne part.

Avant de l'utiliser sur un poste ou des données d'inwi, vérifie que c'est compatible avec la politique de la DSI : ce sont tes propres données d'activité, mais les titres de fenêtres peuvent citer des sujets du projet.

## Le bon modèle pour chaque étape

| Étape | Qui |
|---|---|
| Collecte, masquage, statistiques | le code, sans modèle |
| Conseils du soir | `claude-sonnet-5-5` |
| Synthèse de la semaine | `claude-opus-5-5` |

Les modèles se règlent dans `modeles` de la configuration.

## Installation (une fois)

Il faut **Node.js 20 ou plus récent**. Il faut aussi **Claude Code** connecté à ton compte (la commande `claude`) pour avoir les conseils. Sans lui, les rapports n'ont que les statistiques.

```bash
cd ai-ready
bash observateur/install.sh
```

Puis, dans **Réglages Système → Confidentialité et sécurité** :
1. **Accessibilité** : autorise `node`. Sans cela, les titres de fenêtres restent vides.
2. **Automatisation** : quand macOS le demande, autorise `node` à piloter Safari ou Chrome. Ça sert à lire le domaine de l'onglet.

Pour essayer tout de suite, après quelques minutes d'activité :

```bash
node observateur/analyse.mjs jour --sans-claude     # ~/Documents/Observateur/jour-AAAA-MM-JJ.md
node observateur/analyse.mjs jour                   # avec les conseils de Claude
node observateur/analyse.mjs semaine                # synthèse de la semaine en cours
```

## Réglages

Le fichier `~/.observateur/config.json` est copié de `config.example.json` à l'installation :

| Réglage | Rôle |
|---|---|
| `heures_de_travail` | heures et jours ouvrés, pour compter le temps passé hors des heures |
| `objectifs` | tes règles (concentration, créneaux emails, dispersion) ; les conseils s'y comparent |
| `categories` | applications et domaines rangés en Emails, Réunions, Messagerie, Documents, Claude, Outils projet, Agenda, Web |
| `ignorer_apps`, `masquer_titre_apps` | ce qui n'est pas enregistré, ou enregistré sans titre |
| `conservation_jours` | durée de conservation du journal |
| `dossier_rapports` | où vont les fichiers `jour-…md` et `semaine-…md` |

## Arrêter

```bash
bash observateur/uninstall.sh       # arrête les trois agents ; journal et rapports gardés
```

Tests : `npm run test:observateur`.
