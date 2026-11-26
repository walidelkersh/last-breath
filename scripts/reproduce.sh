#!/usr/bin/env bash
# Rebuilds every generated file from the code: solve reports, simulation reports and documents, and checks that the art files match their script.
# On a clean tree the last line shows only files that changed because the numbers changed.
set -euo pipefail
cd "$(dirname "$0")/.."

python=$(command -v python || command -v python3)
lab() { dotnet run --project src/LastBreath.Lab -c Release -- "$@"; }

lab solve --all
"$python" -I scripts/independent_check.py --dives classic,static,tank
lab simulate --dive classic,static,tank --rounds 10000000 --seed 1
"$python" -I scripts/generate_docs.py
"$python" -I scripts/art/build_art.py --check
git status --short
