#!/usr/bin/env bash
# Compila y corre la prueba del lista de nodos (pestana TRACK) en la PC (solo necesita g++).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_nodos" "$AQUI/host_nodos.cpp"
"$OUT/host_nodos"
