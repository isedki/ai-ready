[Tâche programmée : {{task.name}}]
{{> commun}}

Aide {{moi.name}} à dresser le bilan de sa journée. Source sur chaque fait, « pas de trace écrite » plutôt que « pas fait », rien d'inventé.

1. Lis le suivi ({{stockage.suivi}} : `actions` avec leurs faits datés `events`, `paths`, `politique`, `recette`, `tracker_atos`), les emails du projet du jour (veille politique d'abord) et l'agenda d'aujourd'hui (visites « Visite · … ») et de demain. Cherche dans l'index (CONTEXTE COMBINÉ) ce qui se rattache à chaque fait nouveau.

2. RÉPONSE (16 lignes max, hors annexe), en français :
- « Vigilance : » 3 lignes max : imputations nouvelles (qui, citation, diffusion, nos preuves, réponse proposée) ; statut de la recette (KPI, actions inwi du CR) ; fichier de suivi de l'intégrateur.
- « À anticiper (2 semaines) : » 2 lignes max : ce qui sera présenté comme un retard inwi si rien ne bouge, avec le geste préventif, la personne et la date.
- Ce qui a avancé aujourd'hui, avec la source.
- « Chemin critique : » une ligne par objectif dont le verrou a changé (sinon « inchangé »).
- « Ta valeur ajoutée : » (sourcé), « Angle archi : » si pertinent.
- « Patterns et warnings : » 2 lignes max, avec source et geste proposé.
- Visites du jour : « Résultat ? ».
- Au plus 5 questions numérotées pour mettre le suivi à jour (réponse possible : « 1 oui, 2 jeudi »).
- Demain : réunions, relances, à préparer.
- « À surveiller (pour info) : » ce qu'ont fait aujourd'hui {{personnes.surveiller}}, et ce qu'il faut en retenir.

ANNEXE : une TRAME datée pour chaque action des PRIORITÉS qui traîne (3 jours ouvrés sans fait daté, ou 2 relances et plus), sauf les sujets à surveiller : étapes datées tirées de `events`, qui a la balle et depuis quand, blocage, question qui débloque. Écris-la en tête du champ `next` (« TRAME jj/mm · … », if_version).

3. COPIE : événement de 10 min maintenant « 📝 Bilan {{projet.nom}} · réponds dans Claude » (description = bilan et questions), puis un second juste après « 🧭 Trames {{projet.nom}} · <n> actions qui traînent ». Sans invité, rappel à 0.

4. Notification : « Bilan {{projet.nom}} : <n> questions » + la vigilance en abrégé, sinon les deux premières questions.

5. REGISTRE DES RISQUES ({{stockage.registre_risques}}) : selon la procédure de `p-regles` ; rien sans source écrite ; « Risques : rien de nouveau » sinon.

QUAND IL RÉPOND : applique au suivi (fait daté « {{moi.name}}, oral, jj/mm », clôture seulement s'il le dit), prépare les brouillons de confirmation écrite pour ce qui engage une autre personne, indexe ses réponses (CONTEXTE COMBINÉ, point 4), confirme en 3 lignes. Réponse ambiguë : repose la question.
