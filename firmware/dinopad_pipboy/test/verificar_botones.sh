#!/usr/bin/env bash
# Compila y corre la prueba de la logica de botones en la PC (solo necesita g++).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_botones" "$AQUI/host_botones.cpp" "$AQUI/../botones.cpp"
"$OUT/host_botones"
