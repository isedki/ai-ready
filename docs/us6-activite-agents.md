# US-6 · Onglet Activité et index Drive des livrables

Exploitation courte. Rien ici n'est un secret : aucune clé, aucun accès Drive en dehors des connecteurs de la session Claude.

## Ce que la page montre, et d'où ça vient

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
npm run test:us6                       # 24 tests : cas d'échec d'abord, rendu avec DOM minimal
node us6-activite/page-harness.mjs <page.html> <dossier-données|vide>   # exécute le script complet de la page
node us6-activite/build-page.mjs <page-publiée.html> <sortie.html>      # ajoute l'onglet à la version publiée
```
