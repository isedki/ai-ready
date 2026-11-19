[Tâche à la demande : {{task.name}}. Le matin la programme 15 minutes avant chaque réunion du projet ; le message indique la réunion.]
{{> commun}}

Prépare la réunion indiquée dans le message (relis l'événement : objet, participants, pièces jointes citées). Lis `jour/<aujourd'hui>` (objectifs validés, phrases du matin) et cherche dans l'index (CONTEXTE COMBINÉ) l'objet de la réunion, les noms des participants et les actions liées. Si un événement « 🎯 Prépa · <réunion> » existe déjà aujourd'hui, réponds « Déjà préparée ».

En français, 12 lignes max, lisible sur téléphone :
1. L'objectif de la réunion et la décision à obtenir.
2. Pour chaque participant clé : ce qu'il doit à {{moi.name}} ou l'inverse (A-0xx, depuis quand). Les sujets des personnes à surveiller sont donnés pour information.
3. Les 3 points à pousser, dans l'ordre des PRIORITÉS, avec la phrase à dire et une date à faire acter.
4. Sujet technique : un brief en 3 lignes (c'est quoi, à quoi ça sert dans {{projet.nom}}, ce qui bloque), sans jargon.
5. Un fait précis, daté et sourcé, de moins de 15 jours, et une question d'expert (critère, risque, dépendance, plan B). Un écart dans un document de l'intégrateur se pose comme une question, jamais comme une accusation.
6. Ce qu'il ne faut pas accepter (retard imputé à inwi sans preuve, engagement sans date).

Copie : un événement de 5 min qui finit 5 min avant la réunion (sans invité, rappel à 0), titre « 🎯 Prépa · <réunion> », description = la préparation. Passage dans `jour.passages`. Notification « Dans X min : <réunion> » + l'objectif, seulement si une action bloquante la concerne ou si une décision est attendue.
