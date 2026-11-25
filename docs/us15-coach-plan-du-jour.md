# US-15 · Coach : plan du jour, bilan du soir, verdicts

Statut : développée, **à valider par Issam** (rg-29). Rien ici n'est « livré ».

## Ce que c'est
Le Coach (`agents/ag-coach`, pas de nouvel agent) produit :
- **08h00, lun-ven (heure du Maroc = GMT)** : un plan de 3 à 5 priorités, chacune avec sa raison et ses sources datées (avec leur âge), ce qui attend ta réponse, ce qui est bloqué, ce qui n'a pas pu être lu (« non lu : source — raison »). Jamais de priorité sans source. Gmail, Suivi et profil sont lus seulement.
- **Le soir** (étape E de `~/.claude/scheduled-tasks/resume-conversations-frictions/SKILL.md`, après D, isolée) : priorités traitées sur annoncées (seulement avec preuve), brouillons tels quels / modifiés / non envoyés, priorités ajoutées à la main, faits faux corrigés, part des priorités jugées bonnes. Chaque valeur inconnue s'écrit « — (raison) ».
- **Le seul mail envoyé** : « Plan du jour AAAA-MM-JJ », à ton propre compte (`reglages/coach-plan.self_email`). Tout autre destinataire, un Cc ou un Cci, ou une liste des envoyés illisible : refus (`plan.mjs check-send`, sortie 3). Tous les autres mails restent des brouillons (rg-1).

## Où lire
- Mail « Plan du jour … » dans ta boîte.
- Page du Suivi, onglet **Aujourd'hui**, bloc **Plan du jour** (plan, âge des sources, verdicts, passages manqués).
- Activité du Suivi : une ligne par passage du Coach (plan, veille, bilan) : début, fin, lu, produit, échec (rg-40).

## Donner ton verdict
Pour chaque priorité : `bonne`, `mauvaise` ou `manquante` + une phrase (obligatoire pour mauvaise et manquante).
- **Par mail** : réponds au plan, une ligne par priorité (`P1 bonne`, `P2 mauvaise : …`, `manquante : …`). Les citations (`>`) et la signature sont ignorées. Lu au passage suivant du Coach (recherche sur le fil du plan).
- **Par la page** : boutons bonne / mauvaise / manquante et champ phrase.
Les deux voies écrivent `verdicts/vd-…` mot pour mot ; un nouveau vote sur la même priorité garde l'ancien dans `historique`.

## Vérifier que ça a tourné
1. Le mail du jour existe (`in:sent subject:"Plan du jour AAAA-MM-JJ"`) et `plans/pl-AAAA-MM-JJ.envoi.statut = envoye`.
2. Une ligne `agents/jr-AAAAMMJJ-HHMM-coach-plan` en phase `fin` avec `echec: null`.
3. `node us15-coach/plan.mjs missed <entrée>` ou la page : un passage attendu (plan 08:00, veille 09:05 à 15:05, bilan 18:15) sans ligne, au-delà de 30 min de grâce, est signalé « non exécuté » ; un début sans fin « interrompu ». Aucun passage n'est attendu le week-end.
4. Routine : https://claude.ai/code/routines/trig_013ZSaY9VVyzZRpwoc2i3AhK (liste des exécutions).

## Mécanisme choisi et preuve
- **Plan 08h00 : routine cloud** (`trig_013ZSaY9VVyzZRpwoc2i3AhK`, cron `CRON_TZ=Africa/Casablanca 0 8 * * 1-5`). Les tâches locales de l'app Claude **ne tournent que si l'app est ouverte** (rattrapage au lancement) : un plan de 8h00 manqué parce que le Mac dort n'est pas acceptable. Preuve que le cloud convient : les routines cloud existantes (Matin 8h00, Bilan, Veille) ont des exécutions `SUCCEEDED` avec le connecteur Gmail (liste des routines, 25/11), et le Gmail du connecteur envoie et relit bien (plan réel du 25/11 envoyé et retrouvé en boîte et en envoyés, fil `1a211c39edd86c65`). **Non vérifié** : la première exécution planifiée (26/11 ~08h00) et la réception de la notification.
- **Bilan du soir : tâche locale** `resume-conversations-frictions` (étape E), qui ne tourne que **app ouverte** ; sans exécution, le rapport « non exécuté » du lendemain le dit.
- Le code (`plan-core.js`, `plan.mjs`) est publié dans le Suivi, `reglages/us15-code` (empreintes sha256), pour que la routine cloud n'ait besoin d'aucun chemin du dépôt. Après une modification du code : `node us15-coach/publish-code.mjs <sortie.json> <version>` puis réécrire ce document.
- Recoupement avec « Phénix · Matin (8h00) » : les deux routines tournent à 8h00 ; elles ne partagent aucun document. Pas de désactivation sans ton accord.
- La routine reçoit les connecteurs du compte (Gmail, Calendar, Drive, etc.), comme les autres routines Phénix.

## Idempotence
Avant d'envoyer, la routine relit les envoyés du jour : un plan déjà envoyé n'est jamais renvoyé (`deja_envoye`).

## Arrêt
- Automatique (rg-42, `plan.mjs arret`) : moins de 50 % de priorités jugées bonnes sur 3 semaines (3 verdicts minimum), ou un fait faux non corrigé depuis 2 semaines. Moins de recul ou de verdicts : « — » avec la raison.
- À la main : désactiver la routine (page de la routine, ou `RemoteTrigger update {enabled:false}`), retirer l'étape E du SKILL.md (copie d'origine sans E : `git`/sauvegarde non versionnée, supprimer le bloc « E) BILAN DU COACH »). Les passages A à D ne dépendent pas de E.

## Tests
`npm run test:us15` (55 tests, cas d'échec d'abord : destinataire différent, Cc, envoyés illisibles, plan sans source, verdict sans phrase, réponse mal formée, passage manqué, journal illisible…).

## Limites connues
- Un verdict mail incomplet (« P3 mauvaise » sans phrase) est refusé par `parseReply` ; il n'est pas encore enregistré comme « incomplet » (non codé).
- Le premier passage réel (25/11) a lu 40 fils Gmail sur 89 estimés, métadonnées seulement : les corps des derniers messages ne sont pas lus (signalé dans le mail).
- Les constats de l'Observateur ne sont pas lus (hors périmètre de cette version) ; pas de créneaux de concentration.
- Le tableau d'autonomie de US-14 n'est pas mis à jour pour l'exception « mail à soi-même ».
