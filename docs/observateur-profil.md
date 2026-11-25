# Observateur · un seul profil, challengé

Décision du 25/11 : l'Observateur n'est pas désactivé, il est fixé. Il **observe** (constats, rapports) ; le **profil** a un seul producteur et un seul chemin ; un **contrôle critique** écarte ce qui n'est pas prouvé.

## Le chemin unique

```
Observateur (Mac)            US-14 (soir, étape D)                    contrôle critique                    agents
constats.json, jours.jsonl → profil/profil-<jour> (hypothèses,   →   profil.mjs challenge → profil-challenge  → kb/p-profil-objectifs
rapports Drive               sources, confiance, contradictions)      (preuves + contre-exemples 7 j)          (traits « retenus » seulement)
```

- **Producteur du profil : US-14** (`us14-apprentissage/profil.mjs`). Le portrait hebdomadaire de l'Observateur (`savoir/profil.md`, `portrait.md` sur Drive) reste un *rapport* ; il n'alimente le profil que par des sources `observateur#<clé>` (lecture seule de `constats.json`). La routine cloud du mercredi lit les rapports Drive pour produire des constats, pas un second profil.
- **Sortie unique lue par les agents : `kb/p-profil-objectifs`**, générée par `build --challenge`. Version structurée : `profil/profil-<jour>`. Contrôle : `profil-challenge.json` (à côté, mêmes dates).

## Le contrôle (`us14-apprentissage/challenge.mjs`)

```bash
node us14-apprentissage/profil.mjs challenge <profil.json> --today AAAA-MM-JJ \
  --jours ~/.observateur/savoir/jours.jsonl --constats ~/.observateur/savoir/constats.json \
  [--faits <faits.json>] --out <profil-challenge.json>
node us14-apprentissage/profil.mjs build <profil.json> --out <sortie> --today AAAA-MM-JJ --challenge <profil-challenge.json>
```
Lecture seule sur `~/.observateur`. Verdict par trait :

| Verdict | Condition | Effet |
|---|---|---|
| `retenu` | ≥ 2 preuves distinctes (type, référence, **date valide**, **pointeur `doc`**) et aucun contre-exemple dans les 7 derniers jours | repris par les agents |
| `sans_preuve` | moins de 2 preuves valides (date ou pointeur manquant, constat Observateur disparu) | marqué, **non repris** |
| `contredit` | au moins un contre-exemple daté dans la fenêtre (même si Issam l'avait confirmé : à trancher) | marqué, **non repris** |
| `a_reviser` | non confirmé, aucune preuve depuis plus de 14 jours | marqué, **non repris** |

Contre-exemples cherchés : (1) source `sens: contredit` datée dans la fenêtre ; (2) fait de `faits.json` `{date, ref, texte, contredit: ["ob-n"]}` ; (3) `mesure` déclarée sur le trait `{metrique, op, seuil}` (métriques de `jours.jsonl` : `concentration_minutes`, `changements_par_heure`, `emails_visites`, `actif_minutes`, `devant_pc_minutes`, `lecture_ou_hesitation_pct`), fausse sur plus de la moitié des jours mesurés (2 jours minimum). Les traits écartés apparaissent dans le chunk `po-ecartes` (« ne pas reprendre ») avec leurs raisons ; ils ne sont plus des chunks `ob-n`.

**Limite assumée** : un trait sans `mesure` ni fait dans la fenêtre est « retenu » avec la mention « aucune mesure vérifiable » ou « non contesté faute de données » : absence de contre-exemple, pas confirmation. Le contrôle n'est aussi fort que les `faits.json` et les `mesure` fournis ; un trait formulé comme un souhait (ex. « veut des blocs de concentration ») ne se mesure pas par un comportement.

## Relais Drive

Constats du 25/11 : les rapports **étaient** copiés dans « Observateur · rapports » (jour 24/11 19:08 visible en ligne) mais :
1. `jour-2026-11-23` n'a jamais été copié (copie échouée sans trace : `publishToDrive` avalait l'erreur) et `equipe-2026-11-20` non plus ;
2. `jour-2026-11-19` sur Drive était un rapport vide (72 octets) par-dessus un vrai (8 Ko) ;
3. les résumés de conversation de « Observateur · conversations » s'arrêtent au 20/11 puis 24/11 : la tâche `resume-conversations-frictions` n'a qu'**un** passage enregistré (24/11, 21:43 UTC) ; aucun pour le 23/11. C'est la cause de « Observateur absent depuis le 20/11 » côté conversations.

Réparé (`observateur/savoir.mjs`, `observateur/relais.mjs`) : la copie dit son échec (« Copie Drive : ÉCHEC, raison »), retente par lecture/écriture, vérifie la taille, ne remplace jamais un vrai rapport par un rapport « Aucune activité ».
```bash
node observateur/relais.mjs verifier --depuis 2026-11-19   # code 1 s'il y a un écart
node observateur/relais.mjs reparer  --depuis 2026-11-19   # recopie absents/différents ; n'écrit que dans « Observateur · rapports »
```
Non réparable depuis le dépôt : un jour sans résumé de conversation (ligne « Jours actifs sans résumé de conversation »). La tâche ne tourne que si l'application Claude est ouverte à 18h15.

## À décider par Issam (non fait ici)
- Étape D de `resume-conversations-frictions` : ajouter l'appel `challenge` (avec `faits.json` construit des retours et frictions des 7 jours) avant `build --challenge`. Le SKILL.md est hors dépôt, non modifié.
- Routine cloud « Phénix · Agent Observateur et Profil » : lui faire lire `kb/p-profil-objectifs` plutôt que d'écrire un profil. Non modifiée.
- Déclarer des `mesure` sur les traits qui s'y prêtent.
