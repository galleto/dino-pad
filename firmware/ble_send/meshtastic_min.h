// meshtastic_min.h - Codificacion protobuf minima, a mano, para la API de cliente
// de Meshtastic. C++ puro (sin Arduino) para poder probarlo en la PC con protoc.
//
// Fuentes de los numeros de campo:
//   https://github.com/meshtastic/protobufs/blob/master/meshtastic/mesh.proto
//     ToRadio    { MeshPacket packet = 1; uint32 want_config_id = 3; bool disconnect = 4; }
//     MeshPacket { fixed32 to = 2; Data decoded = 4; bool want_ack = 10; }
//     Data       { PortNum portnum = 1; bytes payload = 2; }
//     FromRadio  { uint32 id = 1; MeshPacket packet = 2; uint32 config_complete_id = 7;
//                  QueueStatus queueStatus = 11; }
//     QueueStatus{ int32 res = 1; uint32 free = 2; uint32 maxlen = 3; uint32 mesh_packet_id = 4; }
//     Constants  { DATA_PAYLOAD_LEN = 233; }  (mesh.options: *Data.payload max_size:233)
//   https://github.com/meshtastic/protobufs/blob/master/meshtastic/portnums.proto
//     TEXT_MESSAGE_APP = 1
// Formato de cable: https://protobuf.dev/programming-guides/encoding/
//
// Campos que NO se mandan a proposito (el firmware los llena, ver
// src/mesh/MeshService.cpp handleToRadio y src/mesh/Router.cpp):
//   from      -> el firmware lo pone en 0 y luego usa su propio nodenum
//   id        -> si es 0, el firmware genera uno
//   hop_limit -> con want_ack=true y hop_limit=0 usa el configurado en el nodo
//   channel   -> 0 = canal primario (valor por defecto de proto3, no se codifica)
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace mt {

static const uint32_t BROADCAST          = 0xFFFFFFFFu;  // comentario de MeshPacket.to
static const uint32_t PORT_TEXT_MESSAGE  = 1;            // TEXT_MESSAGE_APP
static const size_t   DATA_PAYLOAD_LEN   = 233;

// Tipos de cable protobuf
enum : uint8_t { WT_VARINT = 0, WT_I64 = 1, WT_LEN = 2, WT_I32 = 5 };

inline uint8_t tag(uint32_t campo, uint8_t wt) { return (uint8_t)((campo << 3) | wt); }

// Escritor sobre un buffer fijo. Si se desborda, ok = false.
struct Writer {
  uint8_t* buf;
  size_t cap;
  size_t len = 0;
  bool ok = true;
  Writer(uint8_t* b, size_t c) : buf(b), cap(c) {}

  void byte(uint8_t b) {
    if (len >= cap) { ok = false; return; }
    buf[len++] = b;
  }
  void varint(uint64_t v) {
    do {
      uint8_t b = v & 0x7F;
      v >>= 7;
      byte(v ? (b | 0x80) : b);
    } while (v);
  }
  void fixed32(uint32_t v) {
    for (int i = 0; i < 4; i++) byte((uint8_t)(v >> (8 * i)));   // little endian
  }
  void bytes(const uint8_t* d, size_t n) {
    for (size_t i = 0; i < n; i++) byte(d[i]);
  }
};

inline size_t varintLen(uint64_t v) {
  size_t n = 1;
  while (v >= 0x80) { v >>= 7; n++; }
  return n;
}

// ToRadio { want_config_id = nonce }
inline size_t encodeWantConfig(uint8_t* out, size_t cap, uint32_t nonce) {
  Writer w(out, cap);
  w.byte(tag(3, WT_VARINT));
  w.varint(nonce);
  return w.ok ? w.len : 0;
}

// ToRadio { disconnect = true }
inline size_t encodeDisconnect(uint8_t* out, size_t cap) {
  Writer w(out, cap);
  w.byte(tag(4, WT_VARINT));
  w.varint(1);
  return w.ok ? w.len : 0;
}

// ToRadio { packet: MeshPacket { to, decoded: Data { portnum=1, payload=texto }, want_ack } }
// Devuelve 0 si el texto excede DATA_PAYLOAD_LEN o no cabe en el buffer.
// El limite es sobre Data.payload (mesh.options: "*Data.payload max_size:233").
inline size_t encodeTextPacket(uint8_t* out, size_t cap, const char* texto,
                               uint32_t to = BROADCAST, bool wantAck = true) {
  size_t n = strlen(texto);
  if (n > DATA_PAYLOAD_LEN) return 0;
  // Data = portnum (tag + varint) + payload (tag + len + bytes)
  size_t dataLen = 1 + varintLen(PORT_TEXT_MESSAGE) + 1 + varintLen(n) + n;

  // MeshPacket = to (tag + 4) + decoded (tag + len + Data) [+ want_ack (tag + 1)]
  size_t pktLen = (1 + 4) + (1 + varintLen(dataLen) + dataLen) + (wantAck ? 2 : 0);

  Writer w(out, cap);
  w.byte(tag(1, WT_LEN));          // ToRadio.packet
  w.varint(pktLen);
  w.byte(tag(2, WT_I32));          //   MeshPacket.to
  w.fixed32(to);
  w.byte(tag(4, WT_LEN));          //   MeshPacket.decoded
  w.varint(dataLen);
  w.byte(tag(1, WT_VARINT));       //     Data.portnum
  w.varint(PORT_TEXT_MESSAGE);
  w.byte(tag(2, WT_LEN));          //     Data.payload
  w.varint(n);
  w.bytes((const uint8_t*)texto, n);
  if (wantAck) {
    w.byte(tag(10, WT_VARINT));    //   MeshPacket.want_ack
    w.varint(1);
  }
  return w.ok ? w.len : 0;
}

// ---------- Lectura minima de FromRadio (solo campos de primer nivel) ----------

struct FromRadioInfo {
  bool valido = false;
  uint32_t camposVistos = 0;        // bit N = se vio el campo N (N < 32)
  bool tieneConfigComplete = false;
  uint32_t configCompleteId = 0;
  bool tieneQueueStatus = false;
  int32_t qsRes = 0;
  uint32_t qsFree = 0, qsMaxlen = 0, qsPacketId = 0;
};

struct Reader {
  const uint8_t* p;
  const uint8_t* fin;
  bool ok = true;
  Reader(const uint8_t* d, size_t n) : p(d), fin(d + n) {}
  bool fin_() const { return p >= fin; }
  uint64_t varint() {
    uint64_t v = 0;
    for (int s = 0; s < 64; s += 7) {
      if (p >= fin) { ok = false; return 0; }
      uint8_t b = *p++;
      v |= (uint64_t)(b & 0x7F) << s;
      if (!(b & 0x80)) return v;
    }
    ok = false;
    return 0;
  }
  void skip(uint8_t wt, const uint8_t** lenPtr = nullptr, size_t* lenOut = nullptr) {
    switch (wt) {
      case WT_VARINT: varint(); break;
      case WT_I64:    if (fin - p < 8) ok = false; else p += 8; break;
      case WT_I32:    if (fin - p < 4) ok = false; else p += 4; break;
      case WT_LEN: {
        uint64_t n = varint();
        if (!ok || (uint64_t)(fin - p) < n) { ok = false; break; }
        if (lenPtr) *lenPtr = p;
        if (lenOut) *lenOut = (size_t)n;
        p += n;
        break;
      }
      default: ok = false;
    }
  }
};

inline void parseQueueStatus(const uint8_t* d, size_t n, FromRadioInfo& info) {
  Reader r(d, n);
  while (r.ok && !r.fin_()) {
    uint64_t t = r.varint();
    uint32_t campo = (uint32_t)(t >> 3);
    uint8_t wt = t & 7;
    if (wt == WT_VARINT && campo >= 1 && campo <= 4) {
      uint64_t v = r.varint();
      if (campo == 1) info.qsRes = (int32_t)v;   // int32 negativo = varint de 10 bytes
      if (campo == 2) info.qsFree = (uint32_t)v;
      if (campo == 3) info.qsMaxlen = (uint32_t)v;
      if (campo == 4) info.qsPacketId = (uint32_t)v;
    } else {
      r.skip(wt);
    }
  }
}

inline FromRadioInfo parseFromRadio(const uint8_t* d, size_t n) {
  FromRadioInfo info;
  Reader r(d, n);
  while (r.ok && !r.fin_()) {
    uint64_t t = r.varint();
    uint32_t campo = (uint32_t)(t >> 3);
    uint8_t wt = t & 7;
    if (campo < 32) info.camposVistos |= (1u << campo);
    if (campo == 7 && wt == WT_VARINT) {
      info.tieneConfigComplete = true;
      info.configCompleteId = (uint32_t)r.varint();
    } else if (campo == 11 && wt == WT_LEN) {
      const uint8_t* sub = nullptr;
      size_t subLen = 0;
      r.skip(wt, &sub, &subLen);
      if (r.ok) {
        info.tieneQueueStatus = true;
        parseQueueStatus(sub, subLen, info);
      }
    } else {
      r.skip(wt);
    }
  }
  info.valido = r.ok;
  return info;
}

}  // namespace mt
