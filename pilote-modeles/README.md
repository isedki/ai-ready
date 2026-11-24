# Pilote US-8 : agent Veille et Coach via OpenRouter (mode ombre)

**But.** Faire tourner l'agent Veille et Coach avec un modèle moins cher, **en parallèle** de claude.ai (rien n'est coupé), mesurer le coût réel de chaque passage et comparer la qualité.
**Mode ombre.** L'agent lit Gmail, Agenda, Drive et le Copilote, et écrit ses brouillons dans des **fichiers locaux**. Il n'envoie rien et n'écrit dans aucune boîte mail.
**Données.** Tout passe par OpenRouter avec zéro rétention obligatoire (`zdr: true`, `data_collection: deny`). Plafond total 5 $, 0,10 $ par passage, 5 passages par modèle au maximum.
**Modèles** (prix relevés le 24/11/2026) : A `anthropic/claude-haiku-5.5` (0,10 $ / 0,50 $ par million de jetons), B `openai/gpt-oss-120b` (0,05 $ / 0,25 $ ; remplace DeepSeek, écarté le 24/11 : 1 passage réussi sur 3, aucun brouillon), référence `anthropic/claude-sonnet-5.5` (2 $ / 10 $).

## 1. Prérequis
- Un Mac avec Node 20 ou plus (`node -v`), allumé aux heures de passage.
- **Action d'Issam, une fois (≈ 5 min)** : créer un compte OpenRouter, acheter **5 $ de crédit** (le plafond de dépense est ce crédit), créer une clé API. Ne colle jamais la clé dans une conversation.
- Le consentement Google du spike (`spikes/us8-google-mcp`) est repris automatiquement. Sinon, voir « connexion » ci-dessous.

## 2. Installation (une commande)
```bash
cd /Users/issam/ai-ready/.claude/worktrees/us8-etude-passerelle-e404dc/pilote-modeles && ./pilote.sh install
```
Elle crée les dossiers (hors dépôt), reprend le jeton Google du spike, installe le planificateur (5 passages par jour ouvré), puis lance la vérification. Relançable sans casse. Ce qui manque est signalé « À FAIRE » avec la commande à lancer :
```bash
./pilote.sh reglage     # saisie de la clé OpenRouter (rien ne s'affiche) ; stockée dans ~/.config/us8-pilote/env, droits 600
```
```bash
./pilote.sh connexion   # seulement si le jeton Google manque : consentement en lecture seule dans le navigateur
```

## 3. Vérification
```bash
./pilote.sh verifier    # clé, jeton, droits, planificateur, modèles (existence, outils, zéro rétention, prix)
./pilote.sh tester      # 6 tests hors ligne (aucune clé, aucun coût)
./pilote.sh passage     # un passage immédiat des deux modèles (coût attendu : quelques centimes)
```

## 4. Exploitation quotidienne
| Je veux… | Commande |
|---|---|
| lancer un passage maintenant | `./pilote.sh passage` |
| lire les coûts (par jour et par modèle, part du plafond) | `./pilote.sh couts` |
| lire les rapports de l'agent | dossier `~/.local/share/us8-pilote/rapports/` (un fichier par passage et par modèle) |
| lire les brouillons proposés (jamais envoyés) | `~/.local/share/us8-pilote/brouillons/` |
| lire le journal (coût, jetons, durée, statut ; sans contenu) | `~/.local/share/us8-pilote/journal/AAAA-MM-JJ.jsonl` |
| arrêter les passages | `./pilote.sh desinstaller` (le planificateur est retiré, les données restent) |
| relancer | `./pilote.sh install` |

Les passages sont lancés par le planificateur de macOS aux heures de `config/pilote.json` (9h05, 10h35, 12h05, 13h35, 15h05, jours ouvrés). Le journal d'erreurs du planificateur est `~/.local/share/us8-pilote/launchd.log`.

## 5. Comparer à Claude (grille, après 5 passages)
Pour chaque passage, comparer le rapport du modèle B (et A) avec ce que fait l'agent actuel sur claude.ai, sur des faits vérifiés dans Gmail :
| Critère | Seuil |
|---|---|
| Faits cités exacts (source et date) | 100 % : un fait faux = arrêt |
| Brouillons routés selon rg-33 (À, Cc, « à compléter », historique cité) | ≥ 70 % utiles |
| Appels d'outils corrects (pas de boucle, pas d'invention) | aucun échec bloquant |
| Coût par passage | ≤ 0,10 $ (cible rg-27 : 0,25 $) |
Décision à la fin : garder, étendre ou abandonner (chiffrée à partir de `./pilote.sh couts`).

## 6. Incidents courants
| Symptôme | Cause probable | Action |
|---|---|---|
| `refuse_cle_absente` dans le journal | clé non saisie | `./pilote.sh reglage` |
| `erreur_http_401` | clé refusée ou révoquée | refaire une clé, `./pilote.sh reglage` |
| `erreur_http_402` | crédit épuisé | c'est le plafond : décider d'en racheter ou d'arrêter |
| `erreur_http_404` ou « no endpoints » | le modèle n'a plus de point d'accès avec zéro rétention | `./pilote.sh modeles`, changer le modèle dans `config/pilote.json` |
| `refuse_plafond_total` / `refuse_passages_max` | plafond atteint, voulu | relire `couts`, décision d'Issam |
| `coupe_plafond_passage` / `coupe_tours` | passage trop long ou trop cher | lire le journal ; resserrer la consigne `agents/veille-coach.md` |
| « jeton Google refusé » (`invalid_grant`) | consentement expiré (jusqu'à 7 jours en mode test) | `./pilote.sh connexion` |
| aucun passage à l'heure | Mac éteint ou en veille | passage sauté, rien à faire ; `./pilote.sh passage` |

## 7. Retour arrière et désinstallation
```bash
./pilote.sh desinstaller            # retire le planificateur, garde les données
./pilote.sh desinstaller --purger   # efface aussi secrets, journaux, rapports et brouillons
```
Aucun agent claude.ai n'a été modifié : arrêter le pilote suffit à revenir à l'état d'avant. Ensuite : révoquer la clé sur le compte OpenRouter et l'accès Google (https://myaccount.google.com/permissions), puis `./spike.sh nettoyer` dans le dossier du spike.

## 8. Rotation des secrets
- **Clé OpenRouter** : créer une nouvelle clé sur le compte, `./pilote.sh reglage` (coller la nouvelle), supprimer l'ancienne sur le compte, puis `./pilote.sh passage` pour vérifier.
- **Google** : `./pilote.sh connexion` (nouveau consentement), puis retirer l'ancien accès sur la page des autorisations Google.
- Un secret exposé par erreur (conversation, dépôt) : le révoquer d'abord, puis le remplacer.

## 9. Test de réinstallation propre
`./pilote.sh tester` contient un test qui installe dans un dossier vierge, relance l'installation (idempotence), désinstalle avec `--purger` et vérifie qu'aucun résidu ne subsiste (planificateur ignoré dans le test). Test manuel complet : `./pilote.sh desinstaller --purger`, puis `./pilote.sh install` et suivre les « À FAIRE ».

## Fichiers
`pilote.sh` (toutes les commandes), `config/pilote.json` (modèles, prix, plafonds, horaires), `agents/veille-coach.md` (consigne), `src/` (lanceur, outils en lecture seule, journal des coûts, planificateur), `test/` (tests hors ligne), `.env.example` (modèle de secrets, sans valeur).
