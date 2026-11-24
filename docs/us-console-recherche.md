# US-9 · Interroger la base Copilote et les mails depuis la console US-8

**Statut : à faire (non développée).** Rédigée le 24/11/2026 à la demande d'Issam. Aucun code écrit à ce stade.

## Besoin
En tant que coordinateur, je veux, depuis la console locale du pilote (`pilote-modeles/console`, ouverte sur ce Mac), chercher dans la base Copilote et dans mes mails envoyés/reçus, pour retrouver un passage, une décision ou un échange sans passer par un agent.

## Critères d'acceptation
1. **Lecture seule.** La recherche n'écrit jamais dans `data/copilote.sqlite` (connexion ouverte en lecture seule) et n'envoie, ne supprime ni ne modifie aucun mail. Un test vérifie que seules les requêtes SELECT partent.
2. **Interface.** Une carte « Recherche » dans la console, avec un champ et deux cases (Copilote, Mails). Résultats : titre, date, source, extrait court (quelques lignes, pas le document entier).
3. **Mails.** Lecture via le même chemin que le pilote (consentement Google existant, pas de nouvelle autorisation). Sans consentement, la carte dit « non autorisé » et ne plante pas.
4. **Locale et protégée.** Même garde-fous que la console : 127.0.0.1, jeton par démarrage, aucune commande saisie dans la page (requête passée à une action fixe).
5. **Données.** Rien de cette recherche n'est écrit dans les journaux du pilote. Seuls le nombre de résultats et la durée sont journalisés.
6. **Preuve.** Une recherche réelle sur un mot connu, résultat collé dans le rapport de livraison ; sinon « non vérifié ».

## Pistes techniques (à confirmer en phase de développement)
- Le Copilote est déjà une base SQLite (`data/copilote.sqlite`, ≈ 227 Mo au 23/11) interrogée par la route `lib/copilote`. Il faut vérifier si la recherche plein texte existante est réutilisable.
- Le mécanisme « outils externes » de la console (`pilote-modeles/console/outils.json`) affiche des cartes avec des actions à commande fixe : la recherche peut en être une, mais une saisie de texte libre demande une route dédiée, pas une commande.

## Hors périmètre
- Envoi ou création de mail depuis la recherche.
- Modification de la base Copilote ou des connecteurs existants.
- Accès à des mails hors du consentement Google déjà accordé.

## Points à trancher avant développement
- Mails : boîte professionnelle seule, ou aussi Gmail ?
- Durée de conservation des résultats affichés (aucune, par défaut).
