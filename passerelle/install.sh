#!/bin/bash
# Installe la passerelle Gmail → waroom : toutes les 5 minutes, launchd lance passerelle.mjs.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"; mkdir -p "$AGENTS" "$HOME/.passerelle"
cat > "$AGENTS/ma.passerelle.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ma.passerelle</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/passerelle.mjs</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>$HOME/.passerelle/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.passerelle/launchd.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/ma.passerelle" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENTS/ma.passerelle.plist"
echo "Passerelle installée. Premier passage maintenant (macOS va demander d'autoriser le contrôle de Mail : accepter) :"
"$NODE" "$DIR/passerelle.mjs"
