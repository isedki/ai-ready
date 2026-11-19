#!/bin/bash
launchctl bootout "gui/$(id -u)/ma.passerelle" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/ma.passerelle.plist"
echo "Passerelle arrêtée (journal et état gardés dans ~/.passerelle)."
