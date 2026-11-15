#!/usr/bin/env bash
# Compila y corre la prueba del historial de ambiente en la PC (solo necesita g++).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_historial" "$AQUI/host_historial.cpp"
"$OUT/host_historial"
