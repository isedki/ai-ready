[Tâche programmée : {{task.name}}]
{{> commun}}

1. ÉTAT : ArtifactData list (out_dir dans le scratchpad) des collections `actions` et `paths` de {{stockage.suivi}} ; lis `jour` du dernier jour ouvré (objectifs, brouillons, étapes non faites, questions sans réponse).

2. EMAILS : emails {{projet.nom}} depuis la veille 17h (depuis vendredi 17h le lundi) ; fils pertinents en entier ; veille politique d'abord. Un fil déjà présent dans les faits datés d'une action est cité « déjà traité », pas retraité. Suivi mis à jour en un seul batch (faits datés, créations, clôtures sur preuve citée ; l'ambigu devient une question). Indexe les fils lus (CONTEXTE COMBINÉ, point 4).

3. AGENDA : réunions d'aujourd'hui. Pour chaque réunion du projet (hors événements créés par ces tâches), programme avec send_later une préparation 15 minutes avant son début : message « Prépare la réunion <titre> de <hh:mm> (id d'événement <id>) selon le gabarit prepa ». Une seule programmation par réunion ; note-les dans `jour.prepas`.

4. OBJECTIFS DU JOUR À VALIDER : propose au plus 4 objectifs, dans l'ordre des PRIORITÉS, chacun avec la raison (verrou du chemin critique, action bloquante, échéance), le critère de fin, les actions et le porteur. Écris-les dans `jour/<AAAA-MM-JJ>.propositions` ; ils deviennent `objectifs` quand {{moi.name}} les valide (une réponse « ok » suffit). Tant qu'il n'a pas validé, les tâches suivent la dernière liste validée.

5. BROUILLONS : liste les brouillons du projet ; repère ceux qui ont été envoyés (présents dans un fil ou cités dans une réponse). Garde ceux qui servent un objectif, relus contre Gmail (heures, dates relatives, réponse déjà reçue, bon porteur) ; corrige avec update_draft, relis avec get_draft. Au plus 3 nouveaux brouillons par jour. Les autres vont sous « Périmés ou hors objectifs, à supprimer par {{moi.name}} ».

6. RELANCES ET ESCALADES : au plus 5 relances liées aux objectifs (qui, canal : visite, appel, email en dernier ; la phrase à dire). Questions d'escalade selon `p-regles`. « Info à reconfirmer » pour toute action bloquante sans fait daté depuis 3 jours ouvrés.

7. TABLEAU DE BORD ({{stockage.tableau_de_bord}}) : mets à jour les données selon la procédure de `p-regles` ; ne touche pas à la page.

8. COPIE HORS CLAUDE : un événement d'agenda de 8h00 à 8h30 (sans invité, rappel à 0 min), titre « ☀️ Matin {{projet.nom}} · <objectif proposé n°1> · <n> à envoyer », description en texte simple : nouveau depuis hier (sourcé), clôtures, objectifs proposés à valider, brouillons à envoyer (Vérifié, Conséquence, ⭐), périmés, relances, escalades, phrases par réunion, ta valeur ajoutée.

9. JOURNAL : ajoute ton passage à `jour.passages` ({tache: "matin", heure, fait, non_fait}).

10. RÉPONSE (20 lignes max) : nouveau, clôtures, objectifs proposés « à valider », brouillons, questions, « Non fait : … ». Puis une notification : « Matin : objectifs à valider · <n> à envoyer ».
