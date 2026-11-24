# Pilote US-8 : agent Veille et Coach via OpenRouter

**But.** Faire tourner l'agent Veille et Coach avec un modèle moins cher, **en parallèle** de claude.ai (rien n'est coupé), mesurer le coût réel de chaque passage et comparer la qualité.
**Deux modes d'écriture** (`./pilote.sh mode …`) :
- **ombre** (défaut) : les brouillons restent des fichiers locaux ;
- **brouillons** : le modèle A crée de **vrais brouillons Gmail** (rattachés au fil, avec ton Cc automatique), repérables par l'étiquette **`PILOTE-US8`**. Rien n'est jamais envoyé : le code n'appelle aucune route d'envoi, de corbeille ni de suppression (liste blanche testée). Tu relis, supprimes la ligne « PILOTE US-8 » en tête, et tu envoies toi-même.
**Données.** Tout passe par OpenRouter avec zéro rétention obligatoire. Plafonds : 5 $ au total, 0,10 $ par passage, 5 passages réussis par modèle, 15 essais par modèle.
**Modèles** (prix du 24/11/2026) : A `anthropic/claude-haiku-5.5` (0,10 $ / 0,50 $ par million de jetons), B `openai/gpt-oss-120b` (0,05 $ / 0,25 $, écrit ses brouillons en fichier seulement), référence `anthropic/claude-sonnet-5.5` (2 $ / 10 $).

## 0. Le plus simple : la console (boutons)
```bash
./pilote.sh console      # ouvre une page dans ton navigateur
./pilote.sh raccourci    # crée « Pilote US-8.command » sur le Bureau : double-clic pour ouvrir la console
```
La page affiche l'état (mode, planification, passages réussis, dépense, verrou) et propose des boutons : **lancer un passage**, **mettre en pause / reprendre**, **mode ombre ou brouillons Gmail**, statut, coûts, vérification, lien vers les brouillons `PILOTE-US8` dans Gmail, ouverture des dossiers de rapports, et « retrouver un mail » (est-il bien vu et classé ?). Chaque bouton appelle la commande du même nom ci-dessous.
Sécurité : la console n'écoute que ce Mac (127.0.0.1), exige un jeton tiré au hasard à chaque démarrage (dans le lien ouvert), contrôle l'hôte et l'origine, et n'exécute que des actions prévues d'avance : aucune commande ne peut être saisie dans la page. Pour l'arrêter : Ctrl+C dans le terminal. Elle ne remplace pas la planification, qui continue seule.

## 1. Prérequis
- Un Mac avec Node 20 ou plus (`node -v`), allumé aux heures de passage.
- **Action d'Issam, une fois** : compte OpenRouter, 5 $ de crédit, une clé API (jamais dans une conversation).
- Un consentement Google (lecture Gmail, Agenda, Drive ; brouillons Gmail) : `./pilote.sh connexion`.

## 2. Installation (une commande)
```bash
cd <dossier du dépôt>/pilote-modeles && ./pilote.sh install
```
Crée les dossiers hors dépôt, reprend le jeton du spike s'il existe, active la planification, lance la vérification. Relançable sans casse ; ce qui manque est signalé « À FAIRE » :
```bash
./pilote.sh reglage     # clé OpenRouter, tes adresses mail (reconnaître tes réponses, Cc automatique)
./pilote.sh connexion   # consentement Google ; à refaire après un changement d'autorisations
```

## 3. Lancer, planifier, arrêter (sans chevaucher l'agent Veille)
| Je veux… | Commande |
|---|---|
| voir l'état (mode, horaires, passages réussis, coût, verrou) | `./pilote.sh statut` |
| ouvrir la console (boutons) | `./pilote.sh console` |
| lancer un passage maintenant | `./pilote.sh passage` |
| passer en vrais brouillons Gmail (A) | `./pilote.sh mode brouillons` (puis `./pilote.sh connexion` si l'autorisation manque) |
| revenir aux fichiers locaux | `./pilote.sh mode ombre` |
| mettre en pause la planification | `./pilote.sh pause` (ou `planifier off`) |
| la reprendre | `./pilote.sh reprendre` (ou `planifier on`) |

**Pas de chevauchement.**
1. *Horaires décalés* : les passages du pilote sont à 9h40, 11h40, 13h40, 14h40 et 16h40 (jours ouvrés), environ 30 minutes après ceux de l'agent Veille (9h05 à 16h05). Modifiable dans `config/pilote.json`, puis `./pilote.sh install`.
2. *Verrou* : un passage planifié et un passage manuel ne tournent jamais en même temps ; le second s'arrête avec un message.
3. *Étiquette `PILOTE-US8`* : pendant la phase de test, tous les brouillons du pilote sont repérables et filtrables dans Gmail (`label:PILOTE-US8`), distincts de ceux de l'agent Veille.
4. *Pas de doublon* : s'il existe déjà un brouillon pilote sur un fil, le pilote n'en recrée pas (supprime-le ou envoie-le pour en obtenir un nouveau).

## 4. Autorisation des brouillons
La création de brouillons demande l'autorisation Google « gmail.modify ». Elle est plus large que la lecture seule : techniquement, elle permettrait aussi d'envoyer. Le code s'interdit toute écriture hors de trois routes (créer un brouillon, créer l'étiquette, poser l'étiquette), et un test automatique vérifie qu'envoi, corbeille et suppression sont refusés. Pour la retirer : https://myaccount.google.com/permissions.

## 5. Vérification et exploitation quotidienne
```bash
./pilote.sh verifier    # clé, jeton, droits, planification, modèles (existence, outils, zéro rétention, prix)
./pilote.sh tester      # tests hors ligne (aucune clé, aucun coût)
./pilote.sh couts       # coût par jour et par modèle, part du plafond
./pilote.sh retrouver "mots de l'objet"   # un mail est-il vu et bien classé ? (faits seulement, pas de contenu)
```
Fichiers de travail (hors dépôt) : `~/.local/share/us8-pilote/` : `rapports/`, `brouillons/` (copie locale), `journal/` (coût, jetons, durée, statut, catégories d'erreurs ; sans contenu), `launchd.log`.

**Classement par importance.** Les fils des 2 derniers jours sont notés puis traités du plus important au moins important : tes réponses récentes (moins de 8 h d'abord), les échanges à plusieurs allers-retours, ceux où l'on attend ta réponse, important, non lu, étoilé, puis les mots-clés de `config/pilote.json` (blocages, accès, flux, recette, retards, urgence). Les promotions passent en dernier. Tes réponses sont reconnues par tes adresses (`MES_ADRESSES`).

## 6. Alertes
Une notification macOS (une fois par jour et par motif) signale : jeton Google à renouveler, clé absente ou refusée, crédit épuisé, passage coupé ou rapport vide. Aucun contenu dans la notification.

## 7. Comparer à Claude (après 5 passages)
| Critère | Seuil |
|---|---|
| Faits cités exacts (source et date) | 100 % : un fait faux = arrêt |
| Brouillons utiles (routage À/Cc, historique cité, Cc automatique) | ≥ 70 % |
| Appels d'outils corrects | aucun échec bloquant |
| Coût par passage | ≤ 0,10 $ (cible rg-27 : 0,25 $) |
Décision : garder, étendre ou abandonner, chiffrée avec `./pilote.sh couts`.

## 8. Incidents courants
| Symptôme (journal ou notification) | Action |
|---|---|
| `refuse_cle_absente`, `erreur_http_401` | `./pilote.sh reglage` (nouvelle clé) |
| `erreur_http_402` | crédit épuisé : c'est le plafond, décision d'Issam |
| `erreur_http_404` / « no endpoints » | `./pilote.sh modeles`, changer le modèle dans `config/pilote.json` |
| `erreur_google_jeton` | `./pilote.sh connexion` (jusqu'à 7 jours de validité en mode test) |
| `brouillon_gmail` dans les erreurs | `./pilote.sh connexion` (autorisation brouillons), puis `./pilote.sh statut` |
| `coupe_tours`, `rapport_trop_court` | lire le journal ; resserrer `agents/veille-coach.md` |
| `refuse_passages_max`, `refuse_plafond_total` | plafond atteint, voulu : décision d'Issam |
| « Un passage est déjà en cours » | normal (verrou) ; sinon attendre 20 min, le verrou expire seul |
| aucun passage à l'heure | Mac éteint ou en veille : passage sauté ; `./pilote.sh statut` |

## 9. Retour arrière et désinstallation
```bash
./pilote.sh pause                   # arrête les passages automatiques, garde tout
./pilote.sh mode ombre              # plus aucun brouillon Gmail
./pilote.sh desinstaller            # retire la planification, garde les données
./pilote.sh desinstaller --purger   # efface aussi secrets, journaux, rapports et brouillons locaux
```
Les brouillons Gmail déjà créés restent : retrouve-les avec l'étiquette `PILOTE-US8` et supprime-les. Aucun agent claude.ai n'est modifié. Ensuite : révoquer la clé OpenRouter et l'accès Google.

## 10. Rotation des secrets
- **Clé OpenRouter** : nouvelle clé sur le compte, `./pilote.sh reglage`, suppression de l'ancienne, `./pilote.sh passage` pour vérifier.
- **Google** : `./pilote.sh connexion`, puis retirer l'ancien accès sur la page des autorisations.
- Un secret exposé par erreur : le révoquer d'abord, puis le remplacer.

## 11. Ajouter un outil à la console (autres outils externes à Claude)
Ouvre `console/outils.json` et ajoute une entrée dans la liste `outils` : un titre, une description et des actions. Chaque action est une commande **fixe** écrite dans ce fichier versionné (liste d'arguments, lancée depuis la racine du dépôt) ; la page ne peut que la déclencher, jamais en saisir une. `"confirmer": true` demande une confirmation avant. Exemple :
```json
{ "id": "mon-outil", "titre": "Mon outil", "description": "À quoi il sert",
  "actions": [ { "id": "lancer", "libelle": "Lancer", "cmd": ["node", "mon-outil/lancer.mjs"], "confirmer": true } ] }
```
La carte apparaît au rechargement de la page, sous « Autres outils externes à Claude ». Les actions longues tournent en tâche de fond ; leur sortie s'affiche dans la page.

## 12. Test de réinstallation propre
`./pilote.sh tester` installe dans un dossier vierge, relance l'installation, désinstalle avec `--purger` et vérifie l'absence de résidu. Test humain : une personne qui ne connaît pas le projet suit uniquement ce document sur un Mac vierge.

## Fichiers
`pilote.sh` (toutes les commandes), `console/` (page et serveur local, liste d'outils), `config/pilote.json` (modèles, prix, plafonds, horaires, mots-clés d'importance, étiquette), `agents/veille-coach.md` (consigne), `src/` (lanceur, outils, brouillons Gmail à liste blanche, verrou, alertes, statut), `test/` (tests hors ligne), `.env.example` (modèle de secrets, sans valeur).
