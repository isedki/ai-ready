# US-6 · Onglet Activité et index Drive des livrables — remplacé en partie par US-18

> **US-18 (à valider par Issam, rg-29)** : l'onglet Activité est remplacé par une vue en direct. Les cartes « agents » (jusqu'à 22, dont des sessions de développement et des étiquettes), les filtres et le seuil unique de 36 h ouvrées n'existent plus. La section « Vue en direct (US-18) » ci-dessous fait foi pour l'onglet ; le reste (index Drive, règle rg-40, tests) reste valable.

## Vue en direct (US-18)

De haut en bas :
1. **Bandeau de la photo** `agents/runs` : heure, âge, auteur. Absente : « Photo des routines absente : la Veille ne l'a pas encore écrite ». Illisible ou en erreur (`agents/runs.erreur`) : la cause. Plus de 18 h ouvrées sans nouvelle photo : « photo ancienne ». « En direct » = à jour au dernier passage de la Veille (3 par jour), pas à la seconde.
2. **À faire par toi**, dans cet ordre, chaque ligne avec sa source : US au statut à valider (`agents/story-*.progres.a_valider`), brouillons ou livrables obsolètes (`jour/<aujourd'hui>.perimes`), prompts prêts à coller (documents `agents/*` de `type: prompt` et `statut: a_coller`, avec `titre` et `pour`), passages à observer (routine en échec, passage absent, inactive, photo ancienne).
3. **Tableau, une ligne par routine réelle** (photo `agents/runs`) : état, dernier passage (UTC = heure du Maroc), prochain passage (celui de la photo, sinon calculé du cron), seuil, ce qu'elle a produit (dernière entrée de journal ou livrable rattaché, avec sa source). Clic sur la ligne : fiche (ce qu'elle lit, produit, son garde-fou, son modèle) tirée de `us6-activite/routines-fiches.json`.
4. Passages sans champ agent, anomalies, noms écartés (étiquettes `Équipe`, `Principal`, `Agent principal`, `Agent non indiqué`, sessions `Développeur US-n`).

### Photo écrite par la Veille (`agents/runs`)
`{at, par, routines:[{id, nom, cron, enabled, modele, dernier:{at, statut}, prochain}], erreur?}`. Prompt de la Veille : `data/outputs/veille-coach-fusion-prompt-v2.txt`, étape 5bis (à coller par Issam dans la routine ; la page ne l'écrit pas). Les tâches locales (Observateur Mac, US-14, Contrôle des coûts) sont « non lisibles » tant qu'une ligne de photo ne les couvre pas.

### Règles des états
| État | Règle |
|---|---|
| **Passage absent** (rouge) | routine activée dont le dernier passage connu est antérieur au dernier passage prévu par son cron, plus 30 min de tolérance, mesuré à l'heure de la photo (un passage prévu après la photo n'est pas encore jugé) |
| **Échec** (rouge) | `dernier.statut` de type FAILED, erreur, annulé, timeout |
| **Inactif** (rouge) | dernier passage plus ancien que le seuil de la routine |
| **Seuil** | plus long intervalle entre deux passages du cron (62 jours de part et d'autre) + 30 min : 72 h 30 pour lun-ven, 7 j 30 min pour un hebdomadaire. Jamais un seuil unique |
| **Désactivée / Non lisible / Absente de la photo** | gris ou orange, sans alerte |

Cron : 5 champs, préfixe `CRON_TZ=Africa/Casablanca` (ou UTC/GMT) accepté, Maroc = UTC (décision d'Issam, 25/11). Un autre fuseau ou un cron illisible : seuil et passage attendu « — » avec la cause, rien n'est deviné.

### Passages sans champ agent
Un passage de journal sans `agent` n'est plus masqué : rattaché à « Veille et Coach » si l'id contient `coach-veille` (anomalie affichée « rattaché »), sinon listé dans « passages sans agent ». La cause reste corrigée à la source : la Veille écrit toujours `agent: "Veille et Coach"`.

### Aperçu local, retour arrière
```bash
node us6-activite/apercu-demo.mjs <dossier-données> apercu.html            # photo SIMULÉE, bandeau EXEMPLE
node us6-activite/apercu-demo.mjs <dossier-données> apercu.html --sans-photo
node us6-activite/build-page.mjs <page-publiée.html> <sortie.html>         # remplace l'onglet de la version publiée
```
Retour arrière : ne pas publier la sortie ; la version publiée avant US-18 reste l'historique de l'artifact. Rien n'est publié sans validation d'Issam.

## Ancien onglet (US-6, remplacé) : ce que la page montrait, et d'où ça vient

Onglet **Activité** du Suivi (même artifact, mêmes droits). Un seul abonnement par collection, pas de lecture par document.

| Élément | Source | Âge affiché |
|---|---|---|
| Dernier passage d'un agent | le plus récent entre `agents/<journal>.at` et `agents/ag-*.dernier` | heure et « il y a … » |
| Battement (début, étape, fin) | entrées `journal` avec `phase` et `etape` (rg-40) | idem |
| Livrables du jour | collection `livrables` (champ `jour`) | champ `heure` du livrable |
| Étape en cours d'une histoire | `agents/story-us-n.progres` (première étape non cochée) | `progres.at` |
| Planification | champ `quand` de `agents/ag-*` (texte) | — |
| Exécution réelle des tâches planifiées | **non lisible depuis le suivi** : affiché « — » | — |
| Dossier Drive | `reglages/drive-livrables` | — |

Filtres : agent, jour (14 jours au plus). Les âges sont recalculés chaque minute sans nouvelle lecture ; les données arrivent en direct (abonnement). Heures en UTC, comme le reste de la page.

## Lire un « — » ou un « inactif »

- **« — »** : le champ est absent ou invalide dans le suivi. Rien n'est deviné. Le nom du document et la cause sont dans l'encadré « anomalies » en haut de l'onglet.
- **« inactif depuis jj/mm hh:mm »** : le dernier passage connu date de plus de 36 heures ouvrées (les samedis et dimanches UTC ne comptent pas). Seuil unique pour tous les agents : la page ne sait pas lire la fréquence réelle de chaque tâche. C'est un constat sur les écritures, pas un diagnostic de panne.
- **« aucun passage enregistré »** : ni journal ni champ `dernier` valide.
- **« aucun battement fin depuis … »** : un `debut` ou `etape` date de plus de 3 heures ouvrées sans `fin` écrit après.
- **« lecture en échec (code)»** : la collection n'a pas pu être lue ; la cause est celle renvoyée par la base.
- **« heure — »** sur un livrable : l'agent n'a pas écrit l'heure (reconstitution du 24/11 pour les brouillons dont l'heure n'est pas dans le suivi).

## Écrire les données (règle rg-40, `kb/p-regles`)

Livrable : `livrables/lv-AAAAMMJJ-<agent>-<type>-<court>` avec `{agent, type, titre, url ou fil, heure, jour, source}`. Même id = mise à jour, pas de doublon. Battement : `phase` (debut | etape | fin) et `etape` dans l'entrée de journal. Aucune donnée personnelle de tiers.

## Fichiers produits

Règle rg-40 §6 : tout fichier produit pour Issam est créé ou copié dans le sous-dossier du jour et inscrit dans `livrables` (type fichier, lien Drive). Le soir, l'étape C copie ceux qui n'y sont pas encore. Sans cette règle appliquée, le sous-dossier ne contient que `index.md` (cas du 24/11).

## Refaire l'index du jour (une seule action)

Bouton **« Refaire l'index du jour »** de l'onglet : copie un texte à coller dans Claude, qui exécute la procédure ci-dessous. La même procédure est l'étape C de la tâche du soir `resume-conversations-frictions`.

Commande de génération (idempotente, déterministe, sans réseau) :

```bash
node us6-activite/index-md.mjs --day 2026-11-24 --data <dossier contenant agents/ et livrables/> --out index.md
```

`<dossier>` s'obtient par ArtifactData `list` avec `out_dir` sur `agents` et `livrables`. Écriture Drive : dossier « Phénix · Livrables des agents » > sous-dossier AAAA-MM-JJ > `index.md`. Le connecteur Drive ne sait pas remplacer le contenu d'un fichier : la procédure met l'ancien `index.md` à la corbeille (récupérable) puis crée le nouveau, et vérifie par recherche qu'il reste exactement un `index.md` hors corbeille, de même taille que le fichier local. Si le contenu est identique, elle ne touche à rien.

Limite : sans clé Drive, aucun script ne peut écrire seul dans Drive ; l'écriture passe par une session Claude (tâche du soir ou bouton).

## Incidents courants

| Constat | Cause probable | Action |
|---|---|---|
| Onglet vide, « livrables : 0 document » | aucun agent n'écrit encore dans `livrables` | vérifier que rg-40 est lue par les tâches ; relancer le soir |
| « lecture en échec (permission-denied) » | droits de la page ou de l'artifact | ouvrir le Suivi connecté avec le compte propriétaire |
| Anomalie « type inconnu » ou « jour invalide » | document mal écrit par un agent | corriger le document nommé dans l'anomalie |
| Anomalie « doublon » | deux ids pour le même livrable | supprimer le moins récent |
| Deux `index.md` dans un sous-dossier | procédure interrompue entre corbeille et création, ou ancien essai | mettre l'un à la corbeille, relancer l'index |
| Index sans heure pour des brouillons | heure non écrite par l'agent | normal tant que rg-40 n'est pas appliquée |

## Tests

```bash
npm run test:us6                       # 37 tests : cas d'échec d'abord, rendu avec DOM minimal
node us6-activite/page-harness.mjs <page.html> <dossier-données|vide>   # exécute le script complet de la page
node us6-activite/build-page.mjs <page-publiée.html> <sortie.html>      # ajoute l'onglet à la version publiée
```
