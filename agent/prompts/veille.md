[Tâche programmée : {{task.name}}]
Surveille les emails et le dossier Drive du projet, mets le suivi à jour sans rien demander, et ne dérange {{moi.name}} que pour {{notifications.seulement}}.

0. VOIE RAPIDE : lis `jour/<aujourd'hui>` de {{stockage.suivi}} (heure du dernier passage). Cherche dans Gmail les emails reçus depuis ce passage (au moins 1 h 15, requête {{index.gmail}}) et les fichiers du dossier Drive « À traiter » ({{stockage.drive.a_traiter}}). S'il n'y a rien du projet et pas de lot de rattrapage à faire : ajoute le passage à `jour.passages` et réponds « Rien de nouveau ». Ne charge pas les règles pour un passage vide.

Sinon :
{{> commun}}

1. GMAIL : veille politique d'abord (emails de l'intégrateur et de la recette lus en entier, pièces jointes comprises) : actions SI et blocages → `actions` ; imputation ou pré-positionnement contre inwi → `politique` (citation exacte, diffusion, preuves datées, réponse proposée, risque) ; CR de recette, prérequis, KPI → `recette` ; nouvelle version du fichier de suivi de l'intégrateur → `tracker_atos` avec comparaison. Puis les fils avec une demande, une échéance, un blocage, une réponse attendue ou une preuve de fin. Pour chaque sujet, cherche d'abord dans l'index (CONTEXTE COMBINÉ) ce qu'on sait déjà. Suivi mis à jour en un seul batch.

2. DRIVE : MC ou chiffrage → vérification des calculs et Google Doc « Analyse <MC> » dans « Traités » ({{stockage.drive.traites}}) ; architecture, DAT, matrice de flux → résumé dans `docs` de {{stockage.qui_contacter}} ; puis déplace le fichier dans « Traités » avec « Traité le jj/mm : … ».

3. INDEXATION : chaque email du projet lu et chaque document traité entre dans un pack `kb` et dans l'index. RATTRAPAGE : indexe aussi {{task.rattrapage_lot}} fils anciens du projet (requête {{index.gmail}} après {{index.depuis}}), du plus récent au plus ancien, jusqu'à épuisement ; note le dernier fil indexé dans `jour.rattrapage`.

4. BROUILLONS : seulement pour un objectif validé du jour ou une urgence, 3 nouveaux par jour au plus (compte ceux de `jour`). Liste les périmés.

5. URGENCE : événement d'agenda de 15 min dans l'heure (« Urgent {{projet.nom}} : … », rappel à 0) et notification. Imputation nouvelle diffusée à la direction : notification « Imputation à inwi : <qui> · <sujet> · je prépare la réponse factuelle ? ».

6. À 17h05 : remplace `kb/p-suivi` par l'état du suivi (un extrait par action avec ses 5 derniers faits datés) et ajoute à `p-annuaire` les adresses nouvelles vues dans un en-tête.

7. JOURNAL : `jour.passages` ({tache: "veille", heure, fait, non_fait}).

8. RÉPONSE : « Rien de nouveau », sinon 6 lignes max (vigilance, mises à jour avec preuve, escalades, urgences, brouillons prêts, périmés).
