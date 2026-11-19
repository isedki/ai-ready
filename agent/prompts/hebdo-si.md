[Tâche programmée : {{task.name}}]
{{> commun}}

Point hebdomadaire SI pour {{personnes.manager}} : Word et PDF sobres, avec graphiques, sur une semaine. On parle d'« actions ». Document partageable : aucun nom de personne, aucun reproche, statuts neutres ; noms et sources seulement dans le fichier Excel de justification (usage interne). Chaque fait est daté et sourcé ; rien de plus de 15 jours sans « (au jj/mm) ».

1. Données : `actions` et `paths` de {{stockage.suivi}} (out_dir dans le scratchpad), la semaine précédente dans `stats`, le registre des risques ({{stockage.registre_risques}}), les emails de la semaine ; vérifie chaque fait dans l'index (CONTEXTE COMBINÉ).
2. Outil : `kb/p-outil-rapport-hebdo` du Copilote ; écris son champ `code` dans weekly_report.py (scratchpad, dossier séparé des données) et lis `usage`.
3. content.json : synthese (5 puces max, une par chantier qui a bougé, dans l'ordre des PRIORITÉS), prod, decisions (4 max), attention (3 max), labels (un libellé neutre par action touchée), exclude, sources.
4. python3 -I weekly_report.py … ; complète les libellés si LIBELLES_MANQUANTS.
5. Vérifie : pages du PDF en images, aucun nom de l'annuaire dans le Word, chaque chiffre contre chiffres.json.
6. Stocke dans `stats`, doc « AAAA-Sww ».
7. Brouillon à {{personnes.manager}}, Cc {{moi.email}}, objet « [{{projet.nom}}] Point hebdomadaire SI · Sww », PDF joint, au style de {{moi.name}} ; relis avec get_draft.
8. Envoie à {{moi.name}} le PDF et le fichier de justification (SendUserFile).
9. 8 lignes max. Pas d'événement ni de notification (le bilan reprend les chiffres).
