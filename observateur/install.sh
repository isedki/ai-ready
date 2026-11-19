#!/bin/bash
# Observateur · installation sur macOS (utilisateur courant, sans droits administrateur).
# Crée trois agents launchd : le collecteur (toutes les 30 s), le rapport du jour (18h35, lundi→vendredi)
# et la synthèse de la semaine (vendredi 18h45). Désinstallation : observateur/uninstall.sh.
set -euo pipefail

[ "$(uname)" = "Darwin" ] || { echo "Observateur ne tourne que sur macOS."; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js introuvable : installe Node 20 ou plus récent (nodejs.org)."; exit 1; }
CLAUDE="$(command -v claude || true)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/.observateur/logs"
mkdir -p "$AGENTS" "$LOGS" "$HOME/.observateur"
chmod 700 "$HOME/.observateur"
[ -f "$HOME/.observateur/config.json" ] || cp "$DIR/config.example.json" "$HOME/.observateur/config.json"
PATH_ENV="$(dirname "$NODE")${CLAUDE:+:$(dirname "$CLAUDE")}:/usr/bin:/bin:/usr/sbin:/sbin"

plist() { # label, arguments (XML), schedule (XML)
  cat > "$AGENTS/$1.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>$NODE</string>$2</array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH_ENV</string></dict>
  $3
  <key>StandardOutPath</key><string>$LOGS/$1.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$1.log</string>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$1.plist"
}

WEEKDAYS=""
for d in 1 2 3 4 5; do WEEKDAYS="$WEEKDAYS<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>35</integer></dict>"; done

plist ma.observateur.collect  "<string>$DIR/collect.mjs</string>" \
  "<key>StartInterval</key><integer>30</integer><key>RunAtLoad</key><true/>"
plist ma.observateur.jour     "<string>$DIR/analyse.mjs</string><string>jour</string>" \
  "<key>StartCalendarInterval</key><array>$WEEKDAYS</array>"
plist ma.observateur.semaine  "<string>$DIR/analyse.mjs</string><string>semaine</string>" \
  "<key>StartCalendarInterval</key><dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>45</integer></dict>"

echo "Observateur installé."
echo "1) Réglages Système → Confidentialité et sécurité → Accessibilité : autorise « node » ($NODE)"
echo "   (sans cela, le titre des fenêtres reste vide). La première fois, macOS demande aussi d'autoriser"
echo "   node à piloter Safari ou Chrome (Automatisation) : c'est pour lire le domaine de l'onglet."
echo "2) Journal : ~/.observateur/journal · rapports : ~/Documents/Observateur · réglages : ~/.observateur/config.json"
[ -n "$CLAUDE" ] || echo "3) Claude Code (commande « claude ») introuvable : les rapports n'auront que les statistiques, sans conseils."
echo "Essai immédiat : node \"$DIR/analyse.mjs\" jour --sans-claude"
