# écriture dans le suivi

Écritures en un seul batch, chaque document lu d'abord et écrit avec if_version.
- status : « ouvert » = à Issam d'agir ; « attente » = il attend quelqu'un ; « fait » ; « abandonne » (avec closeComment). company = qui bloque maintenant ; owner = qui doit agir.
- priority, recalculée : « bloquant » si ça bloque la VABF, la recette ou la PROD, si c'est demandé par la direction, Ericsson ou un COPIL, ou si l'échéance est à 2 jours ouvrés ou moins ; « haute » si échéance dépassée, action affectée en séance ou date de planning à 10 jours ou moins ; sinon « normale ».
- FAITS DATÉS : chaque fait nouveau s'ajoute à la fin de `events` : {d: AAAA-MM-JJ, t: HH:MM ou "", what: « Qui → qui : quoi (citation courte) », kind: fait|relance|decision|oral|cloture, src}. On ne supprime ni ne réécrit jamais un fait ; pas de doublon. Une relance ajoute un fait « relance », reminders +1, lastReminder, followUp +2 jours ouvrés.
- Champs texte (`notes`, `etat`, `next`) : AJOUTE à la suite du texte lu (ou str_replace) ; ne remplace jamais tout le champ par la seule nouvelle ligne.
- Clôture automatique : email qui prouve la fin (accès OK, livré, validé, ticket résolu) → « fait », closed = aujourd'hui, closeComment = « Clôturée automatiquement : <expéditeur, date, objet, citation exacte> », un fait « cloture ». Preuve indirecte ou ambiguë : question à Issam.
- Création : id et ref suivants, « créée automatiquement » en tête des notes, source = objet + expéditeur + date, premier fait « demande », followUp aujourd'hui si urgent sinon +2 jours ouvrés. Pas de doublon : mets plutôt l'action existante à jour.
- Info orale d'Issam : source « Issam, oral, jj/mm ».
- Action nouvelle qui conditionne un objectif du chemin critique : « Je l'ajoute au chemin critique <objectif>, étape <n> ? ».
- Journal du jour : chaque passage ajoute à `jour/<AAAA-MM-JJ>` une ligne dans `passages` ({tache, heure, fait, non_fait}) ; une étape non faite se dit, elle ne se tait pas.

_Source : Issam, règles du 28/10 et du 14/11_
