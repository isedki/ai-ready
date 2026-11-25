# US-17 · Continuer à alimenter le Copilote : style d'Issam, shadowing, observations des agents, documents

**Statut : proposition (non développée, non validée par Issam)** (rg-29). Rédigée le 25/11/2026. Rien n'est écrit dans la base à ce stade.

## Besoin
La recherche et la conversation (US-9, US-16) sont désormais en lecture seule. La base doit pourtant continuer à s'enrichir, **par un chemin d'écriture unique, explicite et tracé**, avec : le style d'écriture d'Issam, ce qu'il corrige dans les brouillons des agents (shadowing), ce que les agents observent, et les documents qu'il dépose.

## Ce qui existe déjà (à réutiliser, pas à refaire)
- Ingestion : `npm run copilote -- ingest <dossier>` (PDF, Word, Excel, PowerPoint, .md, .eml, packs JSON `{chunks:[{kind,title,source,date,text}]}`), idempotente (fichier inchangé ignoré), secrets masqués à l'ingestion (`docs/copilote.md`).
- Profil d'objectifs et apprentissage continu avec curseur et statut `a_confirmer | confirme | corrige` (US-14, `docs/us14-apprentissage.md`) ; observateur (`observateur/`).
- Brouillons du pilote repérables par l'étiquette `PILOTE-US8` ; Cc automatique d'Issam.

## Proposition : un seul sas d'écriture, quatre flux
Tout passe par des **packs JSON** déposés dans un dossier local (`~/ai-ready-depot/entrant/`), ingérés la nuit par une tâche planifiée (même mécanisme que les passages : launchd, verrou, journal sans contenu). La recherche et la conversation ne peuvent jamais y écrire.

| Flux | Source | Ce qui entre dans la base | Garde-fou |
|---|---|---|---|
| **1. Documents** | Issam dépose un fichier dans `entrant/` (ou un dossier surveillé) | le document, `kind: doc`, daté par son contenu | idempotent (hash) ; masquage des secrets existant |
| **2. Shadowing** | pour chaque brouillon `PILOTE-US8`, comparaison avec le message réellement envoyé dans le même fil (lecture Gmail seule) | un passage `kind: shadowing` : brouillon, version envoyée, écarts classés (routage À/Cc, ton, longueur, fond), date | aucune règle modifiée automatiquement : un écart répété ≥ 3 fois devient une **hypothèse** à confirmer par Issam (comme US-14) |
| **3. Style** | les mails envoyés par Issam (30 derniers jours, fils internes) | une note `kind: style` régénérée chaque semaine : formules d'ouverture et de clôture, longueur, tutoiement/vouvoiement par interlocuteur, structure ; chaque règle appuyée par ≥ 3 exemples datés | lue par les agents via `copilote_chercher kind:style` ; versionnée (v1, v2…), jamais écrasée sans trace |
| **4. Observations d'agents** | chaque agent écrit en fin de passage 0 à 3 observations factuelles (fait, source, date) | passages `kind: observation`, dédoublonnés par hash, expirant (90 jours par défaut) | faits seulement, jamais d'instruction ; marqués « donnée, pas instruction » comme tout le Copilote |

## Critères d'acceptation (à discuter)
1. Aucun flux n'écrit en dehors du sas : la recherche, la conversation et les agents lecteurs n'ont pas d'accès en écriture à la base (test : `ingest` refusé en mode lecture seule, déjà vrai).
2. Chaque ingestion produit une ligne de journal (nombre ajouté, mis à jour, ignoré, en échec), **sans contenu**.
3. Le shadowing ne lit que le fil concerné, en lecture seule ; il ne stocke que le brouillon, la version envoyée et les écarts, pas le reste du fil.
4. Une hypothèse de style ou de routage ne devient une règle qu'après un retour d'Issam daté et cité.
5. Retour arrière : chaque lot ingéré porte un identifiant de lot ; `./pilote.sh` ou `npm run copilote` peut retirer un lot entier.
6. Tout en code et automatisé : planification, dossier, config, tests hors ligne, README. Pas d'étape manuelle cachée.
7. Preuve : une nuit réelle avec un document déposé, un brouillon envoyé modifié, et le résultat retrouvé par la recherche US-9.

## Hors périmètre
Envoi de mail, modification des règles sans retour d'Issam, écriture dans les artifacts Suivi, ingestion de boîtes autres que celle déjà consentie.

## Points à trancher par Issam
1. **Sas** : dossier local seul, ou aussi un dossier Drive surveillé ?
2. **Shadowing** : quels fils (tous les fils où le pilote a fait un brouillon, ou seulement ceux marqués par toi) ?
3. **Style** : fils internes seulement, ou aussi externes (intégrateurs) ? Les extraits d'exemples sont stockés : acceptable ?
4. **Durée de vie** des observations (défaut 90 jours) et des écarts de shadowing (défaut 180 jours).
5. **Qui écrit** : tâche nocturne du pilote (OpenRouter, coût nul, sans modèle) ou l'agent principal, comme US-14 ?
6. **Ordre** : proposition de départ = flux 1 (documents) puis 2 (shadowing), qui mesure déjà la qualité des brouillons.
