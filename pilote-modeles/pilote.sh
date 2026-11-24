#!/usr/bin/env bash
# Pilote US-8 : agent Veille et Coach (mode ombre) via OpenRouter. Une commande par action.
# Usage : ./pilote.sh install | console | raccourci | statut | logs [n] | passage | mode ombre|brouillons | planifier on|off | pause | reprendre | couts | reglage | connexion | verifier | modeles | retrouver "mots" | tester | desinstaller [--purger]
set -euo pipefail
cd "$(dirname "$0")"
HOME_P="${PILOTE_HOME:-$HOME/.config/us8-pilote}"
DATA_P="${PILOTE_DATA:-$HOME/.local/share/us8-pilote}"
LABEL="com.pilote.us8.veille"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
dit() { printf '%s\n' "$*"; }
prereq() {
  command -v node >/dev/null || { dit "Node.js manque : installe-le (https://nodejs.org) puis relance."; exit 1; }
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { dit "Node 20 ou plus requis."; exit 1; }
}
lire_env() { [ -f "$HOME_P/env" ] && grep -E "^$1=" "$HOME_P/env" | head -1 | cut -d= -f2- || true; }
cmd_reglage() {
  mkdir -p "$HOME_P"; chmod 700 "$HOME_P"
  touch "$HOME_P/env"; chmod 600 "$HOME_P/env"
  set_var() { # nom invite secret(1|0)
    local cur; cur="$(lire_env "$1")"
    if [ -n "$cur" ]; then dit "$1 déjà renseigné (laisse vide pour garder)."; fi
    local v; if [ "$3" = 1 ]; then printf '%s' "$2 (rien ne s'affiche) : "; read -rs v; echo; else printf '%s' "$2 : "; read -r v; fi
    [ -z "$v" ] && return 0
    grep -v "^$1=" "$HOME_P/env" > "$HOME_P/env.tmp" || true; printf '%s=%s\n' "$1" "$v" >> "$HOME_P/env.tmp"; mv "$HOME_P/env.tmp" "$HOME_P/env"; chmod 600 "$HOME_P/env"
  }
  set_var OPENROUTER_API_KEY "Clé OpenRouter (compte créé par toi, plafond de crédit à 5 \$)" 1
  set_var MES_ADRESSES "Tes adresses mail, séparées par des virgules (reconnaître tes réponses, te mettre en Cc ; stockées en local seulement)" 0
  set_var GOOGLE_CLIENT_ID "Identifiant du client Google (facultatif si le spike a déjà servi)" 0
  set_var GOOGLE_CLIENT_SECRET "Secret du client Google" 1
  dit "Enregistré dans $HOME_P/env (droits 600, hors dépôt)."
}
plan_on() {
  mkdir -p "$HOME/Library/LaunchAgents"
  node src/plist.mjs > "$PLIST.tmp" && plutil -lint "$PLIST.tmp" >/dev/null && mv "$PLIST.tmp" "$PLIST"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  dit "Planification ACTIVE : $LABEL (horaires dans config/pilote.json, jours ouvrés). Un passage manuel ou planifié ne chevauche jamais un autre (verrou)."
}
plan_off() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  dit "Planification EN PAUSE : plus aucun passage automatique. './pilote.sh passage' reste possible. Reprise : ./pilote.sh reprendre"
}
cmd_mode() {
  mkdir -p "$HOME_P"
  case "${1:-}" in
    ombre) rm -f "$HOME_P/mode"; dit "Mode OMBRE : les brouillons restent des fichiers locaux." ;;
    brouillons)
      echo brouillons > "$HOME_P/mode"
      dit "Mode BROUILLONS : le modèle A crée de vrais brouillons Gmail avec l'étiquette PILOTE-US8 (jamais d'envoi)."
      node --input-type=module -e "import {scopesJeton} from './src/google.mjs'; if(!scopesJeton().includes('gmail.modify')){console.log('  À FAIRE : autorise les brouillons : ./pilote.sh connexion')}" ;;
    *) dit "Usage : ./pilote.sh mode ombre|brouillons"; return 2 ;;
  esac
}
cmd_install() {
  prereq
  mkdir -p "$HOME_P" "$DATA_P/journal" "$DATA_P/rapports" "$DATA_P/brouillons"; chmod 700 "$HOME_P" "$DATA_P"
  # Réutilise le consentement Google du spike s'il existe (évite de recommencer).
  S="${SPIKE_DIR:-$HOME/.config/us8-spike}"
  if [ ! -f "$HOME_P/google-token.json" ] && [ -f "$S/token.json" ]; then cp "$S/token.json" "$HOME_P/google-token.json"; chmod 600 "$HOME_P/google-token.json"; dit "Jeton Google repris du spike."; fi
  if [ ! -f "$HOME_P/env" ] && [ -f "$S/env" ]; then cp "$S/env" "$HOME_P/env"; chmod 600 "$HOME_P/env"; dit "Identifiants Google repris du spike."; fi
  [ -f "$HOME_P/env" ] || { touch "$HOME_P/env"; chmod 600 "$HOME_P/env"; }
  if [ -z "${PILOTE_SANS_LAUNCHD:-}" ]; then
    plan_on
  else dit "(planificateur ignoré : PILOTE_SANS_LAUNCHD)"; fi
  cmd_verifier || { dit; dit "Installation faite ; il reste à compléter ce qui est signalé ci-dessus (./pilote.sh reglage, ./pilote.sh connexion), puis relance ./pilote.sh verifier."; return 0; }
}
cmd_verifier() {
  prereq; local ko=0
  ok() { dit "  OK   $*"; }; ko_() { dit "  À FAIRE  $*"; ko=1; }
  [ -n "$(lire_env OPENROUTER_API_KEY)" ] && ok "clé OpenRouter présente" || ko_ "clé OpenRouter absente : ./pilote.sh reglage"
  [ -f "$HOME_P/google-token.json" ] && ok "jeton Google présent" || ko_ "jeton Google absent : ./pilote.sh connexion"
  [ "$(stat -f %Lp "$HOME_P/env" 2>/dev/null || stat -c %a "$HOME_P/env")" = "600" ] && ok "droits du fichier de secrets (600)" || ko_ "droits du fichier de secrets : chmod 600 $HOME_P/env"
  if [ -z "${PILOTE_SANS_LAUNCHD:-}" ]; then launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && ok "planificateur actif" || ko_ "planificateur absent : ./pilote.sh install"; fi
  node src/modeles.mjs >/dev/null 2>&1 && ok "modèles, outils, zéro rétention et prix conformes (./pilote.sh modeles pour le détail)" || dit "  (contrôle des modèles non concluant : ./pilote.sh modeles)"
  return $ko
}
case "${1:-aide}" in
  install) cmd_install ;;
  reglage) prereq; cmd_reglage ;;
  connexion) prereq; node src/connexion.mjs ;;
  verifier) cmd_verifier ;;
  passage) prereq; PILOTE_FORCER=1 node src/passage.mjs ;;
  couts) prereq; node src/couts.mjs ;;
  modeles) prereq; node src/modeles.mjs ;;
  logs) prereq; node src/journal-cli.mjs "${2:-30}" ;;
  console) prereq; exec node console/serveur.mjs ;;
  raccourci)
    R="$HOME/Desktop/Pilote US-8.command"
    printf '#!/bin/bash\nexec "%s/pilote.sh" console\n' "$PWD" > "$R"; chmod +x "$R"
    dit "Raccourci créé sur le Bureau : « Pilote US-8.command » (double-clic pour ouvrir la console)." ;;
  statut) prereq; node src/statut.mjs; launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && dit "Planification : ACTIVE" || dit "Planification : EN PAUSE (ou non installée)" ;;
  mode) prereq; shift; cmd_mode "$@" ;;
  planifier) case "${2:-}" in on) plan_on ;; off) plan_off ;; *) dit "Usage : ./pilote.sh planifier on|off" ;; esac ;;
  pause) plan_off ;;
  reprendre) prereq; plan_on ;;
  retrouver) prereq; shift; node src/retrouver.mjs "$@" ;;
  tester) prereq; node --test test/pilote.test.mjs test/console.test.mjs ;;
  desinstaller)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; rm -f "$PLIST" "$HOME/Desktop/Pilote US-8.command"
    dit "Planificateur et raccourci retirés."
    if [ "${2:-}" = "--purger" ]; then rm -rf "$HOME_P" "$DATA_P"; dit "Secrets, journaux, rapports et brouillons supprimés. Révoque aussi la clé OpenRouter et l'accès Google (voir README)."; else dit "Secrets et journaux conservés ($HOME_P, $DATA_P). Ajoute --purger pour tout effacer."; fi ;;
  *) sed -n '2,3p' "$0" ;;
esac
