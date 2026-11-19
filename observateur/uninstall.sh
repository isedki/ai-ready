#!/bin/bash
# Observateur · désinstallation : arrête et retire les agents launchd (collecte, question, jour, semaine, équipe).
# Le journal (~/.observateur) et les rapports (~/Documents/Observateur) sont gardés :
# supprime-les toi-même si tu n'en veux plus.
set -uo pipefail
for label in ma.observateur.collect ma.observateur.question ma.observateur.jour ma.observateur.semaine ma.observateur.equipe; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
echo "Observateur arrêté. Données gardées dans ~/.observateur et ~/Documents/Observateur."
