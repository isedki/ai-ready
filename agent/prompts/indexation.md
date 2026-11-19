[Tâche programmée : {{task.name}} — niveau « {{task.modele}} » : lire, extraire, indexer ; aucune décision.]
{{> session-nouvelle}}

Lis `p-regles` (collection `kb` de {{stockage.copilote}}) pour les interdits ; aucun mot de passe ni identifiant recopié.
N'écris ni brouillon, ni action, ni objectif : seulement des extraits dans le Copilote. Aucune notification.

1. EMAILS DU JOUR : fils {{projet.nom}} (requête {{index.gmail}}) reçus depuis la dernière indexation notée dans `jour/<aujourd'hui>.indexation` de {{stockage.suivi}} (sinon depuis 24 h). Pour chaque fil : un extrait par message utile {id « mail-<threadId>-<n> », kind « email », title = objet, source = « email <expéditeur> jj/mm hh:mm », date, text = faits mot pour mot ≤ 1800 caractères (demande, échéance, blocage, décision, preuve de fin, adresses IP, tickets, références)}.
2. RATTRAPAGE : {{task.rattrapage_lot}} fils plus anciens (après {{index.depuis}}), du plus récent au plus ancien, en reprenant après le dernier fil noté dans `jour.rattrapage`.
3. DOCUMENTS : fichiers du dossier « Base de connaissance » ({{stockage.drive.base_de_connaissance}}) non encore indexés : extraits par section ; description « Indexé le jj/mm » sans déplacer le fichier.
4. ÉCRITURE : un seul pack `kb/<AAAAMMJJ-HHMM>` = {source, created, chunks:[…]} (< 200 Ko ; plusieurs packs si besoin), puis `npm run copilote -- ingest` sur les packs.
5. JOURNAL : `jour.indexation` (heure, nombre de fils, dernier fil indexé) et `jour.rattrapage` ; passage {tache: "indexation", heure, fait, non_fait}.
6. RÉPONSE : une ligne (« n fils indexés, m en rattrapage, reste ≈ k »).
