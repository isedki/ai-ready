[Tâche programmée : {{task.name}} — capsule de culture métier, moment : {{task.moment}}]
Lis `p-regles` (collection `kb` de {{stockage.copilote}}). {{projet.note_heure}} Pas de notification : l'événement d'agenda avec rappel à 0 min suffit.

{{moi.name}} lit ses capsules dans les transports : DEUX cas pratiques, 6 à 8 minutes de lecture au total, en lien avec ce qui se fait sur {{projet.nom}}.
Le matin : sujets des réunions et actions de la journée qui commence (agenda + objectifs validés de `jour`). Le soir : sujets apparus dans les emails et réunions de la journée.
Cherche d'abord dans l'index (CONTEXTE COMBINÉ : `npm run copilote -- search`) ce que le projet a écrit sur le sujet.

Format de chaque cas (15 lignes max, chaque terme technique expliqué) :
- « Cas pratique : <situation concrète> » ;
- « La question qu'on peut te poser : » une question réaliste en réunion ;
- 3 à 5 puces : la notion, puis « Dans {{projet.nom}} » : composants concernés, flux, ce que l'intégrateur a livré ou décidé, ce qui reste ouvert (A-0xx), risque et parades (« pratique courante ») ;
- « Ta réponse en réunion : » une phrase posée qui montre qui doit confirmer quoi ;
- « Dans {{projet.nom}}… » 1 à 2 phrases sourcées [document ou email + date], sinon « à vérifier avec <qui> » ;
- « Pour briller : » une question d'expert.
Pas de sujet déjà publié dans la section « Capsules » de {{stockage.fiche}}. Le vendredi soir, le second cas devient un quiz de 5 questions sur la semaine. Tout fait externe (marché, régulateur) vérifié par une recherche web et cité ; sinon on ne l'écrit pas.

Ajoute les deux cas en haut de la section « Capsules » de {{stockage.fiche}} (« ### jj/mm hh:mm · <sujet> »). Copie : événement de 10 min maintenant « 📘 Tram · <sujet 1> + <sujet 2> » (sans invité, rappel à 0, description = les deux cas). Réponds avec les deux cas.
