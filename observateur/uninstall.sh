#!/bin/bash
# Observateur · désinstallation : arrête et retire les trois agents launchd.
# Le journal (~/.observateur) et les rapports (~/Documents/Observateur) sont gardés :
# supprime-les toi-même si tu n'en veux plus.
set -uo pipefail
for label in ma.observateur.collect ma.observateur.jour ma.observateur.semaine; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
echo "Observateur arrêté. Données gardées dans ~/.observateur et ~/Documents/Observateur."
