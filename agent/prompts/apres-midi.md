[Tâche programmée : {{task.name}}]
{{> commun}}

1. ÉTAT : `jour/<aujourd'hui>` de {{stockage.suivi}} (objectifs validés, propositions en attente, brouillons, questions, passages) et la collection `actions`. Si les objectifs proposés le matin ne sont pas validés, repose la question en tête de réponse.
2. EMAILS : emails du projet depuis 8h00, fils pertinents en entier, veille politique d'abord ; un fil déjà présent dans les faits datés n'est pas retraité. Suivi en un seul batch. Repère les brouillons du matin envoyés.
3. DIGEST : 5 lignes max, d'abord ce qui touche les objectifs (qui, quoi, ce que ça change, A-0xx). « Ta valeur ajoutée : » (sourcé), « Angle archi : » si pertinent. Escalades à part ; repose les questions sans réponse.
4. BROUILLONS : relis les brouillons retenus contre les emails du jour (update_draft puis get_draft) ; nouveaux seulement pour un objectif validé ou une urgence (3 par jour au total). Liste : « À envoyer maintenant » (5 max, par impact, Vérifié, Conséquence, ⭐), « Après un préalable », « Périmés ou hors objectifs, à supprimer par {{moi.name}} ».
5. COPIE : événement de 14h15 à 14h40 (sans invité, rappel à 0), titre « 📧 Après-midi {{projet.nom}} · <n> à envoyer », description = digest, questions, brouillons.
6. JOURNAL : passage dans `jour.passages` ; mets à jour `brouillons`, `perimes`, `questions`.
7. RÉPONSE (20 lignes max), puis notification « Après-midi : <n> à envoyer » + premier destinataire et objectif servi.
