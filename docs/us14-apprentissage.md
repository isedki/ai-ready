# US-14 · Profil d'objectifs d'Issam et autonomie progressive

Exploitation courte. Rien ici n'est un secret. Règle associée : rg-41 de `kb/p-regles`.

## Ce qui existe

| Élément | Où | Rôle |
|---|---|---|
| Fiche lue par les agents | `kb/p-profil-objectifs` (artifact Copilote) | un chunk par objectif (ob-n), le tableau d'autonomie, les simplifications du jour |
| Version structurée | `profil/profil-AAAA-MM-JJ` (artifact Suivi) | mêmes données, pour la page et les contrôles |
| Données sources du jour | `us14-apprentissage/profil-2026-11-24.json` | objectifs, autonomie, simplifications ; sans donnée de tiers |
| Contrôle et génération | `us14-apprentissage/profil.mjs`, `profil-core.mjs` | refus automatique d'un profil invalide |
| Chiffres des simplifications | `us14-apprentissage/simplifs.mjs` | compte histoires en attente, questions « non », taille de p-regles |

Chaque objectif est une HYPOTHÈSE datée, avec ses sources (décision, règle, mail daté, outil, retour, friction) et un statut `a_confirmer | confirme | corrige`. Seul un retour d'Issam, daté et cité (`retour_issam: {date, citation}`), change ce statut.

## Schéma d'une hypothèse (consigne d'Issam 24/11 : précis et très inférant)

`categorie` (fond, sous_objectif, contrainte, anti_objectif), `objectif` (réfutable), `refutation` (« fausse si … »), au moins 2 `sources` distinctes et datées (`type`, `ref`, `date`, `doc` = pointeur vérifiable, `sens: contredit` si elle contredit), `confiance` calculée (2 sources faible, 3 moyen, 4 et plus élevé, moins un niveau par source qui contredit), `question` exacte pour Issam, `historique`. Les contradictions entre hypothèses sont dans `profil.contradictions`. Source de l'Observateur : `type: observateur`, `doc: observateur#<clé>` (lecture seule de `~/.observateur/savoir/constats.json`, jamais d'écriture ; constat absent ou ancien = « non disponible » avec sa date).

Vérification sur les données réelles (en plus de la validation) :
```bash
node us14-apprentissage/profil.mjs check <profil.json> --noms <noms> --regles <p-regles.json> --docs <dossier-export> --memoire <p-memoire.json> --observateur <constats.json>
```

## Apprentissage continu

Les 5 premiers jours amorcent le profil. Le profil porte un `curseur` (heure ISO UTC de la dernière mise à jour). Chaque soir l'agent principal ne lit que ce qui est postérieur, construit des apports `{id, source, vu_le}` ou `{nouvel, vu_le}` et appelle `fusionner` (idempotente : doublons ignorés, historique conservé, confiance recalculée, curseur avancé ; sans nouveauté rien n'est écrit). Une hypothèse non confirmée sans nouvelle source depuis 14 jours est marquée `a_reviser`, jamais supprimée. `confirmer` et `corriger` exigent ton retour daté et cité ; la correction garde l'ancien texte.

## Mise à jour chaque soir (agent principal, au bilan)

1. Exporter `agents`, `jour`, `retours`, `frictions` avec ArtifactData `list` et `out_dir` (dossier `<d>`), puis `kb/p-regles` (`<r>`).
2. Lister les noms de personnes de `kb/p-memoire` §2 dans un fichier hors dépôt, un nom par ligne (`<noms>`).
3. Copier `profil-2026-11-24.json` en `profil-<jour>.json`, ajouter ou corriger les objectifs (id `ob-n`, date du jour, sources réelles), conserver les `retour_issam`. Recalculer les chiffres : `node us14-apprentissage/simplifs.mjs <d> --regles <r>/kb/p-regles.json`.
4. Contrôler et générer :
   ```bash
   node us14-apprentissage/profil.mjs build us14-apprentissage/profil-<jour>.json --out <sortie> --noms <noms> --today <jour>
   ```
   Code de sortie 1 et cause en clair si une règle est violée ; rien n'est généré.
5. Écrire `<sortie>/profil-doc.json` dans `profil/profil-<jour>` et `<sortie>/kb-p-profil-objectifs.json` dans `kb/p-profil-objectifs` (ArtifactData `set` avec `file_path`, `if_version` de la version lue), puis relire et comparer. Une écriture refusée ou une relecture différente se signale à Issam, jamais comme réussie.
6. Finir le rapport du soir par 1 à 3 simplifications chiffrées (texte, chiffre mesuré, source).

## Faire confirmer ou corriger les hypothèses

La page du Suivi n'a pas de bloc dédié. Le circuit existant suffit : l'agent principal pose dans les questions du jour (onglet Conseil) une question fermée par groupe de 2 ou 3 objectifs (« ob-3 et ob-4 sont-ils justes ? oui / non / corrige »). La réponse d'Issam est écrite dans `retours/<jour>.questions.<i>` ; l'agent principal la reporte alors dans `retour_issam` de l'objectif (date et citation exacte) et change le statut.

## Autonomie

Le tableau est dans `profil/profil-<jour>.autonomie` : `faits_seuls` (action, règle, date, citation d'Issam) et `a_valider`. Une action passe de « à valider » à « faite seule » uniquement par `elargir` (validation explicite, datée, citée). Le retrait (`restreindre`) est libre et se trace dans `historique`. Seuil proposé dans rg-41 : proposer d'élargir après 3 validations sans correction ; Issam décide.

## Tests

```bash
npm run test:us14
```
31 tests, cas d'échec d'abord : profil vide, une seule source, source sans date, sources contradictoires, confiance au-dessus du calcul, contradictions mal formées, confirmé sans retour d'Issam, donnée personnelle, écriture refusée, relecture différente, élargissement sans validation ni source, proposition sans problème terrain ; puis cas continu : rien de nouveau = rien écrit, rejeu idempotent, second passage du lendemain, hypothèse à réviser. Données factices préfixées `ZZ-TEST`, rien n'est écrit dans le suivi.

## Incidents courants

| Constat | Cause | Action |
|---|---|---|
| `profil vide` | fichier sans objectif | corriger le JSON |
| `source manquante` ou `date manquante` | inférence non sourcée | citer la source réelle ou supprimer l'objectif |
| `donnée personnelle de tiers` | nom, mail, IP ou numéro dans un texte | reformuler en rôle ou en sujet |
| `version` refusée à l'écriture | document modifié entre-temps | relire, refaire le calcul, réécrire avec la nouvelle version |

## Retour arrière

Supprimer `profil/profil-<jour>` et `kb/p-profil-objectifs`, retirer le chunk `rg-41` de `kb/p-regles` (incrémenter sa version). Aucun autre état n'est modifié.
