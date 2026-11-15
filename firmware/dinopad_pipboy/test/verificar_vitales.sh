#!/usr/bin/env bash
# Compila y corre la prueba del semaforo, simulador y mensajes (VITAL y MENS) en la PC (solo necesita g++).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_vitales" "$AQUI/host_vitales.cpp"
"$OUT/host_vitales"
