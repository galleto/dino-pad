#!/usr/bin/env bash
# Valida los mensajes MQTT de firmware/dinopad (contrato.h) contra backend/models.py.
# Necesita g++, python3 e internet la primera vez (instala pydantic en un venv temporal).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_contrato" "$AQUI/host_contrato.cpp"
python3 -m venv "$OUT/venv"
"$OUT/venv/bin/python" -m pip install -q "pydantic>=2,<3"

"$OUT/host_contrato" > "$OUT/mensajes.txt"
# -B: no escribir backend/__pycache__ (esta versionado en el repo)
"$OUT/venv/bin/python" -B "$AQUI/validar_contrato.py" < "$OUT/mensajes.txt"
