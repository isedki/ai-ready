[Tâche programmée : {{task.name}}]
{{> commun}}

Vérifie que tout est correct et précis, sans hallucination, puis porte un regard critique. Pas de notification : l'événement suffit.

A. TESTS sur la semaine, chacun OK ou KO avec la preuve :
1. 6 actions tirées au hasard dans {{stockage.suivi}} (dont toutes les bloquantes modifiées) : 2 affirmations vérifiées mot à mot contre l'email cité.
2. Chaque clôture automatique : la phrase citée existe et dit bien que c'est fini.
3. Phrases de séance : aucune n'affirme « pas fait » sur la seule absence d'email.
4. Événements d'agenda créés par les tâches : heure juste, pas de doublon, pas d'invité.
5. Capsules ({{stockage.fiche}}) : 3 sources ouvertes et vérifiées.
6. Brouillons : destinataires dans l'annuaire, dates exactes, rien d'envoyé.
7. Décisions orales de {{moi.name}} : chacune a un brouillon de confirmation ou est signalée ; aucun champ `notes` ou `etat` raccourci.
8. INDEX : 5 questions de la semaine posées à `npm run copilote -- search` ; la source attendue remonte-t-elle dans les 5 premiers passages ? Les emails et documents de la semaine sont-ils tous indexés ?
9. PÉRIMÈTRE : aucune relance, aucun brouillon ni aucune trame sur un sujet des personnes à surveiller ({{personnes.surveiller}}).
Corrige ce qui est KO (« [jj/mm] Corrigé au contrôle qualité : … »). Score x/y.

B. REGARD CRITIQUE : 3 améliorations max, chacune fondée sur un constat chiffré de la semaine (source, proposition, coût, risque si on ne fait rien).

15 lignes max. Événement de 10 min maintenant « ✅ Contrôle qualité {{projet.nom}} · x/y OK » (sans invité, rappel à 0, description = rapport).
