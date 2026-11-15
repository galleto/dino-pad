#!/usr/bin/env bash
# Compila y corre la prueba del posicion DEMO (pestana TRACK) en la PC (solo necesita g++).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_posicion" "$AQUI/host_posicion.cpp"
"$OUT/host_posicion"
