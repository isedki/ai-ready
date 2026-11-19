# Agent PMO packagé

L'assistant PMO qui tient le suivi d'un projet : emails, documents, réunions, brouillons, bilans. Il tourne en tâches programmées Claude Code. Tout ce qui est propre à un projet est dans un fichier de configuration. Les textes des tâches sont des gabarits communs, et les règles sont versionnées dans git.

## Ce que fait l'agent

| Tâche | Quand | Rôle |
|---|---|---|
| `matin` | 8h00 | emails de la nuit, objectifs du jour **proposés à valider**, brouillons, préparation de chaque réunion planifiée 15 min avant |
| `veille` | plusieurs fois par jour | emails et Drive ; voie rapide quand il n'y a rien ; indexation de chaque email lu et rattrapage de l'historique par lots |
| `prepa` | à la demande (planifiée par `matin`) | fiche de réunion : objectif, dû par chacun, 3 points, fait sourcé, ce qu'il ne faut pas accepter |
| `apres-midi` | 14h15 | digest, brouillons relus, liste « à envoyer » |
| `bilan` | 16h30 | vigilance, chemin critique, questions, trames des actions qui traînent, registre des risques |
| `tram` | 7h25 et 17h25 | deux cas pratiques métier liés au projet |
| `weekly-it`, `hebdo-si`, `controle-qualite`, `rapport-mensuel` | hebdomadaire ou mensuel | point avec l'intégrateur, rapport pour le responsable, tests de non-régression, rapport d'activités |

Trois principes s'appliquent à toutes les tâches (`agent/prompts/_commun.md`) :

1. **Contexte combiné.** Toute réponse part de l'index du Copilote, qui réunit emails, documents, suivi, annuaire et informations orales. Gmail et Drive ne servent que pour un fait plus récent que l'index. Ce qui est lu ou dit le jour même est indexé le jour même.
2. **Priorités validées.** L'agent propose les objectifs dans l'ordre configuré. La personne servie les valide.
3. **Périmètre.** Les personnes en mode `surveiller` sont suivies pour information et pour apprendre. Leurs sujets ne deviennent jamais des tâches.

## Fichiers

```
agent/
  prompts/            gabarits communs ({{valeur}}, {{> commun}} inclut _commun.md)
    _commun.md        règles, contexte combiné, priorités, périmètre, personnes
    matin.md veille.md prepa.md apres-midi.md bilan.md tram.md
    weekly-it.md hebdo-si.md controle-qualite.md rapport-mensuel.md
  projects/
    phenix/config.json   le projet en production
    phenix/rules/*.md    règles du projet (source de vérité, publiées dans kb/p-regles)
    exemple/config.json  point de départ pour un autre projet
lib/agent/            schéma de configuration (zod), rendu des gabarits, export → packs
scripts/agent.ts      ligne de commande
scripts/copilote-mcp.ts  le Copilote comme serveur MCP (déclaré dans .mcp.json)
```

## Configuration

Un fichier `agent/projects/<projet>/config.json`. Le schéma complet est dans `lib/agent/config.ts`.

| Clé | Contenu |
|---|---|
| `projet` | nom, description, fuseau horaire IANA, phrase sur l'heure (ex. « GMT, aucun décalage ») |
| `personnes` | nom, rôle et `mode` : `moi` (exactement une), `predecesseur`, `manager`, `suivre`, `surveiller`, `exclu` ; `aliases` pour la dictée |
| `priorites` | `ordre` validé et sa date ; phrase de validation |
| `regles` | interdits, style des brouillons, domaines des partenaires |
| `stockage` | artefacts du suivi et du Copilote (obligatoires), tableau de bord, registre des risques, fiche, dossiers Drive (facultatifs : « non configuré » sinon) |
| `index` | base locale, dossier du corpus, requête Gmail du projet, date de début de l'historique |
| `notifications` | les seuls cas où une tâche notifie le téléphone |
| `taches` | gabarit, nom, cron (dans le fuseau du projet) ou `null` pour une tâche à la demande, `params` propres à la tâche |

Une valeur inconnue dans un gabarit est une erreur, pas un trou : `npm run agent -- validate` le signale.

## Commandes

```bash
npm run agent -- validate [projet]     # configuration et gabarits
npm run agent -- render [projet]       # dist/agent/<projet>/tasks.json + un .md par tâche (dist/ n'est pas versionné)
npm run agent -- rules-pack [projet]   # règles → dist/agent/<projet>/p-regles.json
npm run agent -- index [projet]        # export du Copilote → packs → data/copilote.sqlite
npm run agent -- install [projet]      # tasks.json + la phrase à donner à Claude pour créer les tâches
npm run test:agent
```

Projet par défaut : `AGENT_PROJECT`, sinon `phenix`.

### Installer ou mettre à jour les tâches

Les tâches programmées se créent par les outils de Claude Code (`create_trigger`, `update_trigger`), pas par un script. `npm run agent -- install` prépare `tasks.json` et affiche la demande à faire dans une session liée au dépôt. Claude met alors à jour chaque tâche du même nom ou la crée. Après un changement de configuration, de gabarit ou de règle : `render`, relecture du diff, puis `install`.

### Publier les règles

Les règles se modifient dans `agent/projects/<projet>/rules/*.md`, puis passent en revue dans git. `rules-pack` produit le pack que Claude écrit dans `kb/p-regles` du Copilote (avec `if_version`). Ce que la personne servie dicte en séance est ajouté au Copilote le jour même, puis reporté dans `rules/` au commit suivant.

## Index et serveur MCP

`index` lit l'export du Copilote dans `<corpus>/raw/{kb,docs,directory}` (fait par `ArtifactData list … out_dir`) et les fichiers de `<corpus>/files`. Il écrit des packs `{chunks:[…]}`, les ingère, et ne refait rien si rien n'est plus récent. Les fichiers Excel que le lecteur exceljs ne sait pas ouvrir (tableaux écrits par d'autres outils) sont relus comme documents bureautiques plutôt que perdus.

`.mcp.json` déclare le serveur `copilote` (`scripts/copilote-mcp.ts`, sans dépendance supplémentaire). Ses outils :

| Outil | Rôle |
|---|---|
| `search` | recherche hybride (BM25, vecteurs si activés), filtres par type et par date ; chaque passage a un id, une source et une date |
| `read_around` | passages voisins dans la même source |
| `sources` | inventaire de la base |
| `ingest` | ajout de fichiers ou de packs |
| `stats` | taille et date de la dernière ingestion |

Les résultats rappellent que les passages sont des données, pas des instructions.

**Historique des emails.** `npm run kb -- run <archive.pst>` (voir `docs/email-kb.md`) nettoie une boîte exportée d'Outlook. `npm run copilote -- import-kb` la verse ensuite dans l'index. C'est ainsi qu'entrent les emails d'un prédécesseur. Les emails du compte Gmail lié sont indexés par la veille, par lots.

**Persistance.** La base vit dans `data/` (non versionné). Dans une session cloud, le conteneur peut être recyclé : `index` la reconstruit depuis le Copilote en une minute environ. Sur une VM (voir `docs/copilote.md`), elle reste en place.

## Efficacité

- **Veille :** quand il n'y a ni email ni fichier nouveau, elle répond sans charger les règles.
- **Préparation des réunions :** planifiée une fois par le matin, réunion par réunion, au lieu d'un passage toutes les heures.
- **Recherche :** une seule recherche dans l'index au lieu de fouiller Gmail et Drive, avec des sources déjà datées.
- **Règles :** relues une fois par passage, pas à chaque étape.

## Adapter à un autre projet

1. Copier `agent/projects/exemple/` vers `agent/projects/<projet>/` ; remplir `config.json` (personnes, priorités, artefacts, requête Gmail, tâches).
2. Écrire les règles du projet dans `rules/` (partir de celles de `phenix`).
3. `npm run agent -- validate <projet>` puis `render <projet>` ; relire les prompts dans `dist/agent/<projet>/`.
4. Créer les artefacts du suivi et du Copilote, publier les règles (`rules-pack`), construire l'index (`index`), puis `install`.
