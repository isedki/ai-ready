# Suivi Phénix : refonte, inventaire avant / après (26/11, non publié)

« Rejoué » : geste fait dans l'aperçu local, sur une copie des données du 26/11 vers 14h45, avec une base **simulée** (les écritures sont relevées, aucune ne sort de l'onglet). Rien n'a été testé sur claude.ai.

## 1. Où est passé chaque onglet

| Avant | Après | Vérifié |
|---|---|---|
| Aujourd'hui | **Aujourd'hui** | Affiché, sans erreur |
| Actions | **Actions › Liste** | Rejoué |
| Chemin critique | Actions › Chemin critique | Affiché |
| Vigilance | Actions › Vigilance | Affiché ; tracker intégrateur réparé |
| Statut global | Actions › Statut global | Affiché |
| Conseil | **Supprimé comme onglet** : son contenu est dans Aujourd'hui | Détail ci-dessous |
| Activité | **Agents › En direct** | Rejoué |
| Agents | **Agents › Sprint, mesures, journal** | Rejoué |

## 2. Fonctions et gestes

| Fonction ou geste | Après | Vérification |
|---|---|---|
| Nouvelle action | Inchangé | Rejoué : `actions` add |
| Alerte doublon | Inchangé | Rejoué : alerte, aucune écriture. « Créer quand même » non rejoué |
| Ouvrir, ajouter un fait, relance, clôture commentée | Inchangé | Rejoué : `actions` set |
| Supprimer avec confirmation | Inchangé | Rejoué : `actions` delete |
| Filtres société, chantier, statut ; compteur « en retard » | Inchangé | Rejoué. Recherche texte rejouée |
| Mode | Aujourd'hui, détail replié | Affiché |
| Un sujet + Demander à Claude + Effacer | Aujourd'hui, replié | Rejoué ; réponse de Claude simulée |
| Plan du jour et verdicts | Aujourd'hui, ouvert s'il y a un plan | Rejoué sur le plan du 25 recopié au 26 : `verdicts` set « bonne ». « Mauvaise » et « manquante » non rejoués |
| Alertes « veille manquée » du plan | **Retirées (à confirmer)** : elles suivaient l'ancien horaire horaire. Alertes plan et bilan gardées | Affiché |
| Objectifs : valider | Inchangé ; état et preuve du bilan ajoutés, source repliée | Rejoué : `retours.objectifs_valides` |
| Objectifs : « Je les change dans Claude » | Inchangé (message seul) | Rejoué |
| Brouillons OK / Modifié / Périmé | Les brouillons déjà traités sont repliés, boutons gardés | Rejoué : `retours.brouillons` |
| Copier le texte d'un brouillon | Inchangé | **Non rejoué** : aucun brouillon du 26 n'a de texte |
| Périmés : cocher | Replié, compteur visible | Rejoué : `retours.perimes` |
| À relancer + Ouvrir | 5 visibles, 3 repliées (les 8 d'avant), « 23 autres » vers Actions | Rejoué |
| Questions (en double : Aujourd'hui et Conseil) | Une seule liste ; la saisie résiste au rafraîchissement | Rejoué : `retours.questions` |
| Appliquer maintenant | Inchangé | Rejoué : `retours` set |
| Coach « Quoi faire maintenant » | En haut d'Aujourd'hui ; « Pourquoi maintenant » replié | Affiché |
| Consigne sur un mail | Sous les questions, replié | Rejoué : `retours.consignes` |
| Usage des livrables 7 j | Agents › Sprint, replié | Affiché |
| Comptage d'usage | « Conseil : ouvert » **n'existe plus** ; « Conseil : clic » quand tu ouvres « Pourquoi maintenant » | Rejoué : `stats` |
| Sprint : Lancer maintenant, Tout cocher, lancer la sélection | Inchangé | Rejoué : `agents` update |
| Sprint : Valider livré, Pas encore | Inchangé | Rejoué : `agents` update |
| Fiche d'histoire (problème, impact, fini, étapes, preuve, note) | Repliée ; titre, statut, barre et boutons visibles | Rejoué : reste ouverte après rafraîchissement |
| Mesures | Cartes datées, « périmée » visible, « — » avec raison ; tableau complet replié | Affiché |
| Équipe, journal, tuiles | Équipe et journal repliés | Affiché |
| Vue en direct US-18 (tableau, anomalies, Drive, index du jour) | Intacte dans « Détail technique » | Bouton « Refaire l'index » cliqué, aucune écriture relevée dans la base simulée |
| **Nouveau** : bande des agents | Aujourd'hui ; un clic ouvre la fiche | Rejoué |
| **Nouveau** : carte par agent | Prouvé, déclaré, prochain, lu, produit, pas fait, à toi | Rejoué |
| Téléphone (375 px) | Aucun débordement ; Vigilance et Sprint débordaient déjà en ligne (1096 et 1259 px) | Mesuré sur Vigilance et Sprint après correction ; autres vues sans débordement de page |

## 3. Base : qui lit, qui écrit

Aucun champ ajouté, renommé ou supprimé. Le test automatique compare identifiants et appels d'écriture avec la page publiée.

| Collection · champs | Page lit | Page écrit | Autres auteurs (consignes du dépôt) |
|---|---|---|---|
| `actions` (ref, subject, owner, company, stream, priority, requested, due, status, reminders, lastReminder, followUp, next, source, notes, events, created, updated, closed) | oui | add, set, delete | Veille |
| `jour/<date>` (objectifs, coach, brouillons, perimes, questions, passages, tram, bilan) | oui ; **en plus** passages et tram des jours précédents | non | Veille, Formateur, bilan hebdo |
| `retours/<date>` (objectifs_valides, brouillons, perimes, questions, consignes, updated) | oui | set | lu par Veille et tâche de 16h48 ; champs `applique` posés par les agents |
| `agents` : histoires (statut, decision_issam, validation_issam, progres, lancer_maintenant) | oui | update | PO, développeurs |
| `agents` : journal, runs, kpi, fiches d'agent | oui | non | Veille (runs), PO, contrôle des coûts, bilan hebdo, tâche de 16h48 |
| `plans` | oui | non | Coach 8h00 |
| `verdicts` | oui | set | réponses mail traitées par le Coach |
| `livrables`, `paths`, `politique`, `recette`, `tracker_atos`, `reglages` | oui | non | agents |
| `stats` | oui | set (usage) | — |
| `profil`, `frictions` | **nouveau, lecture seule** | non | tâche de 16h48, US-14 |
| `ecarts` | non | non | contrôle des coûts |

`jour.bilan_apresmidi` n'est toujours pas affiché.

## 4. Défauts corrigés

| Défaut | Cause constatée dans les données | Correction (page seulement) |
|---|---|---|
| Questions « 1. 2. 3. » vides | Le 25 et le 26, des questions sont écrites en texte seul, la page attendait `{q}` | Les deux formats sont lus |
| « Pourquoi maintenant » absent | `coach.contexte` est un texte, la page attendait une liste | Les deux formats sont lus |
| Brouillon remplacé encore proposé | `etat: remplace` jamais affiché | Replié avec le constat de la Veille |
| Bloc tracker intégrateur vide + erreur console (en ligne) | `synthese` du 13/11 est un texte | Texte affiché |
| Fausses anomalies en vue en direct | La photo écrit « — » pour les dates inconnues | « — » vaut inconnu (`activite-core.js`) |
| Alertes « veille » fausses dans le plan | Ancien horaire 9h05–15h05 | Retirées |

## 5. Tests

us6 47, us15 62, us14 45, observateur 32, agent 8, suivi-refonte 11 : tous au vert.

Pour rejouer : `node suivi-refonte/build-page.mjs <publiee.html> <sortie.html>`, puis `node suivi-refonte/apercu.mjs <sortie.html> <copie-des-donnees> <apercu.html>`.
