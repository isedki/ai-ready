[Tâche programmée : {{task.name}}]
Prépare le rapport d'activités du mois de {{moi.name}} pour {{personnes.manager}}. N'envoie rien : un brouillon Gmail seulement. {{projet.note_heure}}

1. Reprends exactement le modèle `cra-modele` (collection `kb` de {{stockage.copilote}}) : objet, introduction avec la période et les jours du mois, tableau des activités et de l'avancement, tableau des semaines, signature.
2. Avancement = jours cumulés depuis le début du bon de commande ÷ {{task.jours_bdc}}, arrondi à l'unité. Cumul = cumul du dernier rapport envoyé (Gmail, objet « Rapport d'activités ») + jours du mois. Signale si le cumul approche ou dépasse {{task.jours_bdc}}.
3. Jours travaillés : 5 par semaine pleine, jours fériés et absences retirés seulement s'ils sont connus ; colonnes « à confirmer ».
4. Brouillon HTML à {{personnes.manager}}, Cc {{moi.email}}, sans lien complet ; relis avec get_draft.
5. 5 lignes : période, jours du mois, cumul et pourcentage, ce qu'il faut confirmer. Notification « Rapport d'activités <mois> prêt : <n> j, <p> % à confirmer ».
