#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_ZIP="${ROOT_DIR}/lichess-importer-webstore.zip"

FILES=(
  "manifest.json"
  "background.js"
  "popup.html"
  "popup.js"
  "popup.css"
  "options.html"
  "options.js"
  "options.css"
  "chooser.html"
  "chooser.js"
  "chooser.css"
  "icons/icon16.png"
  "icons/icon32.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

cd "${ROOT_DIR}"
rm -f "${OUT_ZIP}"

if command -v zip >/dev/null 2>&1; then
  zip -q "${OUT_ZIP}" "${FILES[@]}"
else
  python3 - <<'PY'
from pathlib import Path
import zipfile

root = Path.cwd()
out = root / "lichess-importer-webstore.zip"
files = [
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "options.html",
    "options.js",
    "options.css",
    "chooser.html",
    "chooser.js",
    "chooser.css",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        p = root / rel
        if not p.is_file():
            raise FileNotFoundError(f"Missing required file: {rel}")
        zf.write(p, arcname=rel)
PY
fi

echo "Created: ${OUT_ZIP}"
