#!/usr/bin/env bash
# Spike US-8 : un jeton de renouvellement permet-il à un script d'utiliser les serveurs MCP Google ?
# Usage : ./spike.sh sonde | reglage | connexion | verifier | tester | nettoyer
set -euo pipefail
cd "$(dirname "$0")"
DIR="${SPIKE_DIR:-$HOME/.config/us8-spike}"
command -v node >/dev/null || { echo "Node.js manque : installe-le (https://nodejs.org) puis relance."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Node 20 ou plus requis."; exit 1; }
case "${1:-aide}" in
  sonde)     node probe.mjs ;;
  reglage)
    mkdir -p "$DIR"; chmod 700 "$DIR"
    printf "Identifiant du client (se termine par .apps.googleusercontent.com) : "; read -r ID
    printf "Secret du client (rien ne s'affiche) : "; read -rs SECRET; echo
    umask 077; printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' "$ID" "$SECRET" > "$DIR/env"
    echo "Enregistré dans $DIR/env (droits 600, hors dépôt). Étape suivante : ./spike.sh connexion" ;;
  connexion) node login.mjs ;;
  verifier)  node check.mjs ;;
  tester)    node --test ;;
  nettoyer)  rm -rf "$DIR"; echo "Jeton, secret et résultat supprimés. Pense à révoquer l'accès sur https://myaccount.google.com/permissions" ;;
  *) sed -n '2,3p' "$0" ;;
esac
