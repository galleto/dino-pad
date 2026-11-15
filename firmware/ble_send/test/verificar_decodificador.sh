#!/usr/bin/env bash
# Prueba datos_tracker.cpp (Nanopb) con FromRadio generados por protoc a partir
# de los .proto oficiales. Los datos de ejemplo son ficticios.
# Uso: verificar_decodificador.sh <ruta a meshtastic/protobufs>
set -euo pipefail
PROTOS="${1:?uso: $0 <ruta a meshtastic/protobufs>}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
SK="$AQUI/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

for c in "$SK"/src/mtpb/*.c; do
  gcc -c -O1 -Wall -I"$SK/src/mtpb" -o "$OUT/$(basename "$c" .c).o" "$c"
done
g++ -std=c++17 -Wall -Wextra -Werror -I"$SK" -o "$OUT/host_decode" \
    "$AQUI/host_decode.cpp" "$SK/datos_tracker.cpp" "$OUT"/*.o

enc() {  # enc <Mensaje> <texto> <archivo>
  protoc -I "$PROTOS" --encode="meshtastic.$1" meshtastic/mesh.proto meshtastic/telemetry.proto > "$3" <<< "$2"
}
esc() {  # bytes -> literal de texto protobuf con escapes octales
  od -An -v -to1 "$1" | tr -s ' \n' ' ' | sed 's/ \([0-7]\{3\}\)/\\\1/g; s/ //g'
}

N=0
fr() { N=$((N+1)); enc FromRadio "$1" "$OUT/$(printf '%03d' $N).bin"; }

fr 'id: 1 my_info { my_node_num: 2864434397 nodedb_count: 3 reboot_count: 7 pio_env: "tracker-t1000-e" }'
fr 'id: 2 metadata { firmware_version: "2.7.0.abcdef" hw_model: TRACKER_T1000_E role: TRACKER hasBluetooth: true }'
fr 'id: 3 node_info { num: 2864434397 user { long_name: "Prueba T1000" short_name: "PT1" hw_model: TRACKER_T1000_E }
      position { latitude_i: 194326000 longitude_i: -991332000 altitude: 2240 sats_in_view: 9 }
      device_metrics { battery_level: 87 voltage: 4.05 channel_utilization: 3.5 air_util_tx: 0.4 uptime_seconds: 3600 } }'
fr 'id: 4 node_info { num: 305419896 user { long_name: "Otro nodo" short_name: "OTRO" }
      position { latitude_i: 1 longitude_i: 2 } device_metrics { battery_level: 50 } }'
fr 'id: 5 config { position { gps_mode: ENABLED position_broadcast_secs: 900 gps_update_interval: 120 } }'
fr 'id: 6 config { lora { region: US use_preset: true modem_preset: LONG_FAST } }'
fr 'id: 7 config { bluetooth { enabled: true mode: FIXED_PIN fixed_pin: 123456 } }'
fr 'id: 8 moduleConfig { telemetry { device_update_interval: 1800 environment_measurement_enabled: false } }'
fr 'id: 9 channel { index: 0 role: PRIMARY settings { name: "" psk: "\001" } }'
fr 'id: 10 config_complete_id: 1221568007'

# Telemetria anidada en Data.payload (como llega cada minuto del propio nodo)
enc Telemetry 'time: 1700000000 device_metrics { battery_level: 101 voltage: 4.2 uptime_seconds: 3660 }' "$OUT/t1.bin"
fr "id: 11 packet { from: 2864434397 to: 4294967295 decoded { portnum: TELEMETRY_APP payload: \"$(esc "$OUT/t1.bin")\" } }"
enc Telemetry 'time: 1700000060 environment_metrics { temperature: 24.5 lux: 37 }' "$OUT/t2.bin"
fr "id: 12 packet { from: 2864434397 to: 4294967295 decoded { portnum: TELEMETRY_APP payload: \"$(esc "$OUT/t2.bin")\" } }"
enc Position 'latitude_i: 194327000 longitude_i: -991333000 sats_in_view: 11' "$OUT/p1.bin"
fr "id: 13 packet { from: 2864434397 to: 4294967295 decoded { portnum: POSITION_APP payload: \"$(esc "$OUT/p1.bin")\" } }"
# Telemetria de OTRO nodo: no debe cambiar los datos del tracker
enc Telemetry 'device_metrics { battery_level: 5 }' "$OUT/t3.bin"
fr "id: 14 packet { from: 305419896 to: 4294967295 decoded { portnum: TELEMETRY_APP payload: \"$(esc "$OUT/t3.bin")\" } }"
fr 'id: 15 queueStatus { res: 0 free: 15 maxlen: 16 mesh_packet_id: 919400838 }'
# Routing: ACK implicito (NONE) y NAK (MAX_RETRANSMIT) para el id enviado
enc Routing 'error_reason: NONE' "$OUT/r1.bin"
fr "id: 16 packet { from: 2864434397 to: 2864434397 decoded { portnum: ROUTING_APP payload: \"$(esc "$OUT/r1.bin")\" request_id: 919400838 } }"
enc Routing 'error_reason: MAX_RETRANSMIT' "$OUT/r2.bin"
fr "id: 17 packet { from: 2864434397 to: 2864434397 decoded { portnum: ROUTING_APP payload: \"$(esc "$OUT/r2.bin")\" request_id: 919400838 } hop_start: 3 hop_limit: 1 rx_time: 1794690436 }"
> "$OUT/018.bin"   # FromRadio vacio (cero bytes) tambien es un mensaje valido

"$OUT/host_decode" "$OUT"/[0-9][0-9][0-9].bin
