#!/bin/bash
# Test de bout en bout du moteur de transcription (même code que l'app), sur macOS.
# 1. Synthétise une « réunion Phénix » : passages en français truffés de jargon + un passage en arabe,
#    avec les voix système (say), en un seul fichier WAV 16 kHz d'environ 1 min (plusieurs tranches).
# 2. Lance reunions-cli avec le modèle de production.
# 3. Vérifie : langues détectées par tranche, termes du jargon correctement écrits (seuil), pas de tranche vide.
#
#   E2E/run.sh <chemin de reunions-cli> [modèle]
set -euo pipefail
CLI="$1"
MODEL="${2:-large-v3-v20240930_626MB}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"
rm -rf "$OUT" && mkdir -p "$OUT"

pick_voice() { say -v '?' | awk -v loc="$1" '$0 ~ loc { print $1; exit }'; }
FR_VOICE="$(pick_voice 'fr_FR')"
AR_VOICE="$(pick_voice 'ar_')"
[ -n "$FR_VOICE" ] || { echo "Aucune voix française installée"; exit 1; }
echo "Voix : français=$FR_VOICE arabe=${AR_VOICE:-aucune}"

speak() { # voix fichier texte
  say -v "$1" -r 165 -o "$OUT/$2.aiff" "$3"
  afconvert -f WAVE -d LEI16@16000 -c 1 "$OUT/$2.aiff" "$OUT/$2.wav"
}

speak "$FR_VOICE" fr1 "Bonjour à tous, c'est le Weekly IT du projet Phénix. Le flux entre SOA et OCS est toujours bloqué sur la VABF. Badr Jbari doit valider la matrice de flux, puis le Support Sécurité ouvrira le flux dans le ticket INC4564097."
speak "$FR_VOICE" fr2 "Côté accès, Wallix fonctionne pour l'équipe Inetum, mais les scripts DMH et BCH sont introuvables pour l'utilisateur recette. Mohamed Ali Boudriga confirme la date demain. Le chiffrage MGEN 4007 est validé, la MGEN 4005 reste en cours de validation."
PARTS="fr1 fr2"
if [ -n "$AR_VOICE" ]; then
  speak "$AR_VOICE" ar1 "مرحبا بالجميع. هل تم فتح الولوج لفريق الاختبار؟ نعم، تم فتحه أمس، وسنرسل التأكيد اليوم."
  PARTS="$PARTS ar1"
fi
speak "$FR_VOICE" fr3 "Action pour Faris Hajji : appliquer la configuration sur les vingt et une machines virtuelles de production EB25 avant lundi. CreditSet passe en production le treize janvier, et APIGEE doit exposer le nouveau service."
PARTS="$PARTS fr3"

python3 "$HERE/concat.py" "$OUT/meeting.wav" $(for p in $PARTS; do echo "$OUT/$p.wav"; done)

"$CLI" "$OUT/meeting.wav" --model "$MODEL" --mode auto \
  --participants "Badr Jbari, Mohamed Ali Boudriga, Faris Hajji" \
  --json "$OUT/result.json" | tee "$OUT/transcript.txt"

python3 "$HERE/check.py" "$OUT/result.json" ${AR_VOICE:+--expect-arabic}
