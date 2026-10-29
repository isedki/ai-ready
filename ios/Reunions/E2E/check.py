"""Vérifie le résultat de reunions-cli et écrit un rapport (aussi dans le résumé GitHub Actions)."""
import json
import os
import re
import sys

path = sys.argv[1]
expect_arabic = "--expect-arabic" in sys.argv
report_only = "--report-only" in sys.argv
label = sys.argv[sys.argv.index("--label") + 1] if "--label" in sys.argv else "transcription"
result = json.load(open(path, encoding="utf-8"))
text = result["text"]
chunks = result["chunks"]

# Termes du jargon prononcés dans l'audio de test, avec la forme exacte attendue.
JARGON = ["Phénix", "SOA", "OCS", "VABF", "Badr Jbari", "Wallix", "Inetum", "DMH", "Boudriga",
          "MGEN", "Faris Hajji", "EB25", "CreditSet", "APIGEE", "Support Sécurité", "Weekly IT"]
found = [t for t in JARGON if re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", text)]
missing = [t for t in JARGON if t not in found]
recall = len(found) / len(JARGON)

problems = []
if len(chunks) < 2:
    problems.append(f"une seule tranche ({len(chunks)}) : le découpage n'a pas été exercé")
if any(not c["text"].strip() for c in chunks[:-1]):
    problems.append("tranche vide au milieu de l'audio")
fr_chunks = [c for c in chunks if c["language"] == "fr"]
if not fr_chunks:
    problems.append("aucune tranche détectée en français")
arabic_script = re.search(r"[؀-ۿ]", text) is not None
if expect_arabic and not any(c["language"] == "ar" for c in chunks):
    problems.append("le passage arabe n'a pas été détecté comme arabe")
if expect_arabic and not arabic_script:
    problems.append("aucun texte en écriture arabe dans la transcription")
THRESHOLD = 0.75
if recall < THRESHOLD:
    problems.append(f"jargon : {recall:.0%} des termes corrects (seuil {THRESHOLD:.0%})")

speed = result["processingSeconds"] / max(result["audioSeconds"], 1)
report = [
    f"## Test de bout en bout : {label}",
    f"- Modèle : `{result['model']}`, mode `{result['mode']}`",
    f"- Audio : {result['audioSeconds']:.0f} s en {len(chunks)} tranches ; traitement {result['processingSeconds']:.0f} s "
    f"({speed:.2f} × la durée, sur le Mac de CI, sans Neural Engine)",
    f"- Langues par tranche : {', '.join(c['language'] for c in chunks)}",
    f"- Jargon correct : **{len(found)}/{len(JARGON)} ({recall:.0%})**",
    f"- Manquants : {', '.join(missing) if missing else 'aucun'}",
    "",
    "### Transcription",
    *[f"- `{c['start']:.1f}-{c['end']:.1f} s · {c['language']}` {c['text']}" for c in chunks],
    "",
    "### Verdict",
    ("OK" if not problems else "ÉCHEC : " + " ; ".join(problems)) + (" (pour information, non bloquant)" if report_only else ""),
]
print("\n".join(report))
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write("\n".join(report) + "\n")
sys.exit(1 if problems and not report_only else 0)
