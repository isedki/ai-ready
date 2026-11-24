# Spike US-8 : un script peut-il utiliser Gmail, Drive et Calendar sans claude.ai ?

**Question.** Les serveurs MCP officiels de Google (Gmail, Drive, Calendar) acceptent-ils un jeton de renouvellement stocké en local, utilisé par un script, sans que tu doives te reconnecter toutes les heures ?
**Sécurité.** Lecture seule (aucune écriture, aucun envoi), aucun modèle, aucun coût, rien dans le dépôt, le résultat n'affiche jamais le contenu de tes mails. Ne colle jamais l'identifiant, le secret ni le jeton dans une conversation.
**Durée.** ≈ 15 minutes, dont ≈ 10 pour la création du client chez Google.

## Ce qui est déjà fait (sans toi, 24/11)
`./spike.sh sonde` : les trois serveurs répondent sans identification pour **lister** leurs outils (Gmail 23, Calendar 9, Drive 9). `./spike.sh tester` : 3 tests hors ligne passent (renouvellement deux fois, lecture JSON et flux SSE, aucun contenu dans le résultat, refus si le jeton est révoqué).

## Ce que tu dois faire (une seule fois)
Prérequis : Node 20 ou plus (`node -v`), un navigateur connecté à ton compte Google.

1. **Inscription au programme préliminaire : à ignorer au début.** Google la décrit comme réservée aux comptes Google Workspace (formulaire : https://developers.google.com/workspace/preview) et ne dit rien des comptes Gmail personnels. Ne remplis pas le formulaire : passe directement à l'étape 2 ; si les serveurs refusent ton compte (erreur 403 à la vérification), c'est la réponse du spike.
2. **Créer le client OAuth en mode personnel** : ouvre
   https://console.cloud.google.com/auth/overview/personal?apis=ws,wsmcp,tasksmcp&clientType=desktop&isAgent=true
   Choisis (ou crée) un projet, donne un nom (ex. « spike-us8 »), **laisse cochée** la case « Use this client for an AI-powered agent », accepte la politique, puis copie l'**identifiant du client** et le **secret**. La console active elle-même les API nécessaires.
3. Dans un terminal, depuis ce dossier (`spikes/us8-google-mcp`) :

```bash
./spike.sh reglage     # te demande l'identifiant et le secret (le secret ne s'affiche pas) ; stocke dans ~/.config/us8-spike/env (droits 600)
```
```bash
./spike.sh connexion   # ouvre le navigateur ; accepte la lecture seule de Gmail, Drive, Calendar ; message « Jeton ... enregistré » attendu
```
```bash
./spike.sh verifier    # renouvelle le jeton 2 fois, interroge les 3 serveurs en lecture seule, affiche le VERDICT
```

4. **Ce que tu m'envoies** : uniquement les lignes `1)`, `2)` et `VERDICT` affichées (aucun secret n'y figure).
5. **Preuve de durée (facultatif mais utile)** : relance `./spike.sh verifier` demain, puis dans 7 jours. Google limite parfois les jetons des applications « en test » à 7 jours : c'est ce que cette relance mesure.
6. **Quand tu as fini** : `./spike.sh nettoyer` (supprime jeton, secret et résultat), puis révoque l'accès sur https://myaccount.google.com/permissions.

## Lire le résultat
| Ligne | OUI | NON |
|---|---|---|
| 1) renouvellement | un script se passe de ton consentement : le projet est faisable | le jeton est refusé : on garde le mode ombre sans Gmail (ou on essaie un client « Web ») |
| 2) gmail / calendar / drive | connexion et lecture seule acceptées | le serveur refuse : copie le message d'erreur (sans secret) |

## Incidents courants
- « Il manque l'identifiant… » → fais `./spike.sh reglage`.
- « Google n'a pas donné de jeton de renouvellement » → refais `connexion` ; sinon retire l'accès sur la page des autorisations Google et recommence.
- `invalid_grant` à la vérification → jeton expiré ou révoqué : refais `connexion`.
- Erreur 403 sur un serveur → l'inscription au programme (étape 1) ou l'API du serveur n'est pas active pour ce projet.

## Fichiers
`spike.sh` (commandes), `probe.mjs`, `login.mjs`, `check.mjs`, `lib.mjs`, `spike.test.mjs`. Jetable : supprimer le dossier `spikes/us8-google-mcp/` retire tout (rg-38).
