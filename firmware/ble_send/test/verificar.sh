#!/usr/bin/env bash
# Verifica los bytes de meshtastic_min.h contra los .proto oficiales de Meshtastic.
# Uso: verificar.sh <ruta_al_repo_meshtastic_protobufs>
#   git clone --depth 1 https://github.com/meshtastic/protobufs.git
set -euo pipefail
PROTOS="${1:?uso: $0 <ruta a meshtastic/protobufs>}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

g++ -std=c++17 -Wall -Wextra -Werror -o "$OUT/host_test" "$AQUI/host_test.cpp"

# FromRadio de ejemplo generados por protoc (para probar el lector)
dec() { protoc -I "$PROTOS" --decode=meshtastic.ToRadio meshtastic/mesh.proto < "$1"; }
enc() { protoc -I "$PROTOS" --encode=meshtastic.FromRadio meshtastic/mesh.proto > "$2" <<< "$1"; }
enc 'id: 5 config_complete_id: 69420' "$OUT/fr_config.bin"
enc 'id: 9 queueStatus { res: 0 free: 15 maxlen: 16 mesh_packet_id: 3735928559 }' "$OUT/fr_queue.bin"
enc 'queueStatus { res: -1 free: 0 maxlen: 16 }' "$OUT/fr_queue_neg.bin"
enc 'id: 3 my_info { my_node_num: 1234 } ' "$OUT/fr_myinfo.bin"
: > "$OUT/fr_vacio.bin"

"$OUT/host_test" "$OUT" "$OUT"/fr_*.bin

echo
echo "== protoc --decode=meshtastic.ToRadio =="
for f in "$OUT"/texto.bin "$OUT"/texto_233.bin "$OUT"/want_config_*.bin "$OUT"/disconnect.bin; do
  echo "--- $(basename "$f")"
  dec "$f"
done

echo
echo "== Ida y vuelta: protoc --encode del mensaje esperado debe dar bytes identicos =="
protoc -I "$PROTOS" --encode=meshtastic.ToRadio meshtastic/mesh.proto > "$OUT/esperado.bin" <<'EOF'
packet {
  to: 4294967295
  decoded { portnum: TEXT_MESSAGE_APP payload: "prueba dinopad" }
  want_ack: true
}
EOF
if cmp -s "$OUT/esperado.bin" "$OUT/texto.bin"; then
  echo "IDENTICOS ($(stat -c %s "$OUT/texto.bin") bytes)"
else
  echo "DIFERENTES"; od -An -tx1 "$OUT/esperado.bin"; od -An -tx1 "$OUT/texto.bin"; exit 1
fi
