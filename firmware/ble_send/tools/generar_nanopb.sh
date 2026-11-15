#!/usr/bin/env bash
# Regenera src/mtpb/ (codigo Nanopb) a partir de los .proto oficiales de Meshtastic.
#
# Version usada: nanopb 0.4.9.3, meshtastic/protobufs commit 42625d0d (2026-11-14).
# Requisitos: protoc, python3. El generador se instala en un venv temporal.
# Uso: tools/generar_nanopb.sh [ruta a meshtastic/protobufs]
set -euo pipefail
NANOPB_VER=0.4.9.3
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
DST="$AQUI/src/mtpb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PROTOS="${1:-}"
if [ -z "$PROTOS" ]; then
  git clone --depth 1 -q https://github.com/meshtastic/protobufs.git "$TMP/protobufs"
  PROTOS="$TMP/protobufs"
fi
echo "protobufs: $(git -C "$PROTOS" log -1 --format='%h %cd' 2>/dev/null || echo '?')"

python3 -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install -q "nanopb==$NANOPB_VER"
curl -sfL "https://github.com/nanopb/nanopb/archive/refs/tags/nanopb-$NANOPB_VER.tar.gz" | tar xz -C "$TMP"

# mesh.proto y todo lo que importa (field_metadata define opciones usadas por los demas)
ARCHIVOS="atak channel config device_ui field_metadata mesh module_config portnums telemetry xmodem"
mkdir -p "$TMP/gen"
( cd "$PROTOS" && "$TMP/venv/bin/nanopb_generator" -q -s enum_to_string:true \
    -L '#include "%s"' -I . -D "$TMP/gen" $(for a in $ARCHIVOS; do echo "meshtastic/$a.proto"; done) )

rm -f "$DST"/*.pb.[ch] "$DST"/pb*.[ch]
mkdir -p "$DST"
cp "$TMP"/gen/meshtastic/*.pb.[ch] "$DST/"
cp "$TMP/nanopb-nanopb-$NANOPB_VER"/pb*.[ch] "$DST/"
cp "$TMP/nanopb-nanopb-$NANOPB_VER/LICENSE.txt" "$DST/LICENSE-nanopb.txt"
cp "$PROTOS/LICENSE" "$DST/LICENSE-meshtastic-protobufs.txt"
# Arduino compila src/ sin rutas de include extra: todo plano en src/mtpb
sed -i 's#\#include "meshtastic/\([a-z_]*\.pb\.h\)"#\#include "\1"#' "$DST"/*.pb.[ch]
echo "listo: $DST"
