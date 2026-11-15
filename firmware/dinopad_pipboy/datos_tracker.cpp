// datos_tracker.cpp - ver datos_tracker.h
#include "datos_tracker.h"

#include <string.h>

#include "src/mtpb/pb_decode.h"

// ---------------------------------------------------------------------------
// Nombres (son los nombres de campo de los .proto; los tags vienen de los .pb.h)
// ---------------------------------------------------------------------------
const char* nombreVariante(uint32_t tag) {
  switch (tag) {
    case meshtastic_FromRadio_packet_tag:                 return "packet";
    case meshtastic_FromRadio_my_info_tag:                return "my_info";
    case meshtastic_FromRadio_node_info_tag:              return "node_info";
    case meshtastic_FromRadio_config_tag:                 return "config";
    case meshtastic_FromRadio_log_record_tag:             return "log_record";
    case meshtastic_FromRadio_config_complete_id_tag:     return "config_complete_id";
    case meshtastic_FromRadio_rebooted_tag:               return "rebooted";
    case meshtastic_FromRadio_moduleConfig_tag:           return "moduleConfig";
    case meshtastic_FromRadio_channel_tag:                return "channel";
    case meshtastic_FromRadio_queueStatus_tag:            return "queueStatus";
    case meshtastic_FromRadio_xmodemPacket_tag:           return "xmodemPacket";
    case meshtastic_FromRadio_metadata_tag:               return "metadata";
    case meshtastic_FromRadio_mqttClientProxyMessage_tag: return "mqttClientProxyMessage";
    case meshtastic_FromRadio_fileInfo_tag:               return "fileInfo";
    case meshtastic_FromRadio_clientNotification_tag:     return "clientNotification";
    case meshtastic_FromRadio_deviceuiConfig_tag:         return "deviceuiConfig";
    case meshtastic_FromRadio_lockdown_status_tag:        return "lockdown_status";
    case meshtastic_FromRadio_region_presets_tag:         return "region_presets";
    case meshtastic_FromRadio_display_frame_tag:          return "display_frame";
    case meshtastic_FromRadio_display_palette_tag:        return "display_palette";
    case 0:                                               return "(vacio)";
    default:                                              return "?";
  }
}

static const char* nombreConfig(uint32_t tag) {
  switch (tag) {
    case meshtastic_Config_device_tag:     return "device";
    case meshtastic_Config_position_tag:   return "position";
    case meshtastic_Config_power_tag:      return "power";
    case meshtastic_Config_network_tag:    return "network";
    case meshtastic_Config_display_tag:    return "display";
    case meshtastic_Config_lora_tag:       return "lora";
    case meshtastic_Config_bluetooth_tag:  return "bluetooth";
    case meshtastic_Config_security_tag:   return "security";
    case meshtastic_Config_sessionkey_tag: return "sessionkey";
    case meshtastic_Config_device_ui_tag:  return "device_ui";
    default:                               return "?";
  }
}

static const char* nombreModulo(uint32_t tag) {
  switch (tag) {
    case meshtastic_ModuleConfig_mqtt_tag:                  return "mqtt";
    case meshtastic_ModuleConfig_serial_tag:                return "serial";
    case meshtastic_ModuleConfig_external_notification_tag: return "external_notification";
    case meshtastic_ModuleConfig_store_forward_tag:         return "store_forward";
    case meshtastic_ModuleConfig_range_test_tag:            return "range_test";
    case meshtastic_ModuleConfig_telemetry_tag:             return "telemetry";
    case meshtastic_ModuleConfig_canned_message_tag:        return "canned_message";
    case meshtastic_ModuleConfig_audio_tag:                 return "audio";
    case meshtastic_ModuleConfig_remote_hardware_tag:       return "remote_hardware";
    case meshtastic_ModuleConfig_neighbor_info_tag:         return "neighbor_info";
    case meshtastic_ModuleConfig_ambient_lighting_tag:      return "ambient_lighting";
    case meshtastic_ModuleConfig_detection_sensor_tag:      return "detection_sensor";
    case meshtastic_ModuleConfig_paxcounter_tag:            return "paxcounter";
    case meshtastic_ModuleConfig_statusmessage_tag:         return "statusmessage";
    case meshtastic_ModuleConfig_traffic_management_tag:    return "traffic_management";
    case meshtastic_ModuleConfig_tak_tag:                   return "tak";
    case meshtastic_ModuleConfig_mesh_beacon_tag:           return "mesh_beacon";
    default:                                                return "?";
  }
}

static const char* nombreTelemetria(uint32_t tag) {
  switch (tag) {
    case meshtastic_Telemetry_device_metrics_tag:      return "device_metrics";
    case meshtastic_Telemetry_environment_metrics_tag: return "environment_metrics";
    case meshtastic_Telemetry_air_quality_metrics_tag: return "air_quality_metrics";
    case meshtastic_Telemetry_power_metrics_tag:       return "power_metrics";
    case meshtastic_Telemetry_local_stats_tag:         return "local_stats";
    case meshtastic_Telemetry_health_metrics_tag:      return "health_metrics";
    case meshtastic_Telemetry_host_metrics_tag:        return "host_metrics";
    default:                                           return "?";
  }
}

static const char* oVacio(const char* s) { return (s && s[0]) ? s : "-"; }

// ---------------------------------------------------------------------------
// Decodificacion
// ---------------------------------------------------------------------------
uint32_t epochEstimado(const DatosTracker& d, uint32_t ahora) {
  if (!d.epochRef) return 0;
  return d.epochRef + (ahora - d.msRef) / 1000;
}

bool decodificarFromRadio(const uint8_t* datos, size_t len, meshtastic_FromRadio* out) {
  memset(out, 0, sizeof(*out));
  pb_istream_t s = pb_istream_from_buffer(datos, len);
  return pb_decode(&s, meshtastic_FromRadio_fields, out);
}

// Telemetry y Position vienen como bytes dentro de Data.payload: se decodifican
// en estaticos para no gastar pila (Telemetry ocupa ~312 B).
static meshtastic_Telemetry telemetriaTmp;
static meshtastic_Position posicionTmp;
static meshtastic_Routing routingTmp;

static void tomarMetricas(const meshtastic_DeviceMetrics& m, DatosTracker& d, uint32_t ahora,
                          bool guardado) {
  d.metricasGuardadas = guardado;
  if (m.has_battery_level)       { d.tieneBateria = true;  d.bateria = m.battery_level; }
  if (m.has_voltage)             { d.tieneVoltaje = true;  d.voltaje = m.voltage; }
  if (m.has_channel_utilization) { d.tieneUsoCanal = true; d.usoCanal = m.channel_utilization; }
  if (m.has_air_util_tx)         { d.tieneAirTx = true;    d.airTx = m.air_util_tx; }
  if (m.has_uptime_seconds)      { d.tieneUptime = true;   d.uptime = m.uptime_seconds; }
  d.msMetricas = ahora ? ahora : 1;
  d.cambio = true;
}

static void tomarPosicion(const meshtastic_Position& p, DatosTracker& d, uint32_t ahora) {
  if (p.has_latitude_i && p.has_longitude_i) {
    d.tienePosicion = true;
    d.latitudI = p.latitude_i;
    d.longitudI = p.longitude_i;
    d.satelites = p.sats_in_view;
    d.msPosicion = ahora ? ahora : 1;
    d.epochPosicion = p.time;
  }
  if (p.has_altitude) { d.tieneAltitud = true; d.altitud = p.altitude; }
  d.cambio = true;
}

static void imprimirMetricas(const meshtastic_DeviceMetrics& m, FnLog v) {
  if (m.has_battery_level) v(" bateria=%lu%%", (unsigned long)m.battery_level);
  if (m.has_voltage) v(" voltaje=%.3fV", m.voltage);
  if (m.has_channel_utilization) v(" uso_canal=%.2f%%", m.channel_utilization);
  if (m.has_air_util_tx) v(" air_util_tx=%.2f%%", m.air_util_tx);
  if (m.has_uptime_seconds) v(" uptime=%lus", (unsigned long)m.uptime_seconds);
}

static void imprimirPosicion(const meshtastic_Position& p, FnLog v) {
  if (p.has_latitude_i && p.has_longitude_i)
    v(" lat=%.7f lon=%.7f", p.latitude_i * 1e-7, p.longitude_i * 1e-7);
  else
    v(" (sin lat/lon)");
  if (p.has_altitude) v(" alt=%ldm", (long)p.altitude);
  if (p.sats_in_view) v(" sats=%lu", (unsigned long)p.sats_in_view);
  if (p.time) v(" time=%lu", (unsigned long)p.time);
}

static void contarPuerto(Estadisticas& est, uint32_t portnum) {
  for (auto& e : est.porPuerto) {
    if (e.cuenta && e.portnum == portnum) { e.cuenta++; return; }
    if (!e.cuenta) { e.portnum = portnum; e.cuenta = 1; return; }
  }
}

static void procesarPaquete(const meshtastic_MeshPacket& p, DatosTracker& d, Estadisticas& est,
                            uint32_t ahora, FnLog v) {
  bool propio = d.tieneMiNodo && (p.from == d.miNodo || p.from == 0);
  if (p.has_rx_time && p.rx_time > d.epochRef) {   // el reloj solo avanza
    d.epochRef = p.rx_time;
    d.msRef = ahora;
  }
  if (v) {
    v(" from=!%08lx%s", (unsigned long)p.from, propio ? "(propio)" : "");
    if (p.has_rx_time) v(" rx_time=%lu", (unsigned long)p.rx_time);
    if (p.hop_start >= p.hop_limit && p.hop_start) v(" saltos=%u", (unsigned)(p.hop_start - p.hop_limit));
    if (p.via_mqtt) v(" via_mqtt");
    v(" ch=%u", (unsigned)p.channel);
  }
  if (!propio && p.from) {   // otro nodo oido: actualizar la lista (sin su posicion)
    bool tieneSaltos = p.hop_start && p.hop_start >= p.hop_limit;
    uint32_t oido = p.has_rx_time ? p.rx_time : epochEstimado(d, ahora);
    d.nodos.actualizar(p.from, nullptr, tieneSaltos, (uint8_t)(p.hop_start - p.hop_limit), oido, p.via_mqtt);
    d.cambio = true;
  }

  if (p.which_payload_variant != meshtastic_MeshPacket_decoded_tag) {
    if (v) v(" cifrado (%u B)", (unsigned)p.encrypted.size);
    return;
  }
  const meshtastic_Data& dat = p.decoded;
  contarPuerto(est, dat.portnum);
  if (v) v(" %s", meshtastic_PortNum_name(dat.portnum));

  if (dat.portnum == meshtastic_PortNum_TELEMETRY_APP) {
    memset(&telemetriaTmp, 0, sizeof telemetriaTmp);
    pb_istream_t s = pb_istream_from_buffer(dat.payload.bytes, dat.payload.size);
    if (!pb_decode(&s, meshtastic_Telemetry_fields, &telemetriaTmp)) {
      if (v) v(" (Telemetry invalido: %s)", PB_GET_ERROR(&s));
      return;
    }
    if (telemetriaTmp.which_variant < 16) est.telemetriaVariante[telemetriaTmp.which_variant]++;
    if (v) v(" %s", nombreTelemetria(telemetriaTmp.which_variant));
    if (telemetriaTmp.which_variant == meshtastic_Telemetry_device_metrics_tag) {
      if (v) imprimirMetricas(telemetriaTmp.variant.device_metrics, v);
      if (propio) tomarMetricas(telemetriaTmp.variant.device_metrics, d, ahora, false);
    } else if (telemetriaTmp.which_variant == meshtastic_Telemetry_environment_metrics_tag) {
      const meshtastic_EnvironmentMetrics& e = telemetriaTmp.variant.environment_metrics;
      if (v && e.has_temperature) v(" temperatura=%.2fC", e.temperature);
      if (v && e.has_lux) v(" lux=%.1f", e.lux);
      if (propio) {
        if (e.has_temperature) { d.tieneTemperatura = true; d.temperatura = e.temperature; }
        if (e.has_lux) { d.tieneLuz = true; d.luz = e.lux; }
        d.msAmbiente = ahora ? ahora : 1;
        // Hora de la medicion: rx_time del paquete (el dato guardado que el
        // tracker reenvia al conectar trae su hora original)
        uint32_t epoch = p.has_rx_time ? p.rx_time : epochEstimado(d, ahora);
        if (epoch) {
          d.epochAmbiente = epoch;
          MuestraAmbiente m;
          m.epoch = epoch;
          m.tieneTemp = e.has_temperature;
          m.temp = e.temperature;
          m.tieneLuz = e.has_lux;
          m.luz = e.lux;
          d.historial.agregar(m);   // ignora repetidas o mas viejas
        }
        d.cambio = true;
      }
    }
  } else if (dat.portnum == meshtastic_PortNum_POSITION_APP) {
    memset(&posicionTmp, 0, sizeof posicionTmp);
    pb_istream_t s = pb_istream_from_buffer(dat.payload.bytes, dat.payload.size);
    if (!pb_decode(&s, meshtastic_Position_fields, &posicionTmp)) {
      if (v) v(" (Position invalido: %s)", PB_GET_ERROR(&s));
      return;
    }
    if (propio) {
      if (v) imprimirPosicion(posicionTmp, v);
      tomarPosicion(posicionTmp, d, ahora);
    } else if (v) {
      v(" (posicion de otro nodo, no se imprime)");
    }
  } else if (dat.portnum == meshtastic_PortNum_ROUTING_APP) {
    memset(&routingTmp, 0, sizeof routingTmp);
    pb_istream_t s = pb_istream_from_buffer(dat.payload.bytes, dat.payload.size);
    if (!pb_decode(&s, meshtastic_Routing_fields, &routingTmp)) {
      if (v) v(" (Routing invalido: %s)", PB_GET_ERROR(&s));
      return;
    }
    if (v) v(" request_id=%lu", (unsigned long)dat.request_id);
    if (routingTmp.which_variant == meshtastic_Routing_error_reason_tag) {
      if (v) v(" error_reason=%s", meshtastic_Routing_Error_name(routingTmp.error_reason));
      if (dat.request_id) {
        d.tieneRouting = true;
        d.routingRequestId = dat.request_id;
        d.routingFrom = p.from;
        d.routingError = routingTmp.error_reason;
        d.routingContador++;
        d.cambio = true;
      }
    } else if (v) {
      v(" variante=%u", (unsigned)routingTmp.which_variant);
    }
  } else if (dat.portnum == meshtastic_PortNum_TEXT_MESSAGE_APP) {
    if (v) v(" texto=%u B", (unsigned)dat.payload.size);
  }
}

void procesarFromRadio(const meshtastic_FromRadio& fr, DatosTracker& d, Estadisticas& est,
                       uint32_t ahora, FnLog v) {
  est.total++;
  uint32_t tag = fr.which_payload_variant;
  if (tag < 32) est.porVariante[tag]++;
  if (v) v("#%lu %s", (unsigned long)est.total, nombreVariante(tag));

  switch (tag) {
    case meshtastic_FromRadio_my_info_tag: {
      const meshtastic_MyNodeInfo& m = fr.my_info;
      d.tieneMiNodo = true;
      d.miNodo = m.my_node_num;
      d.cambio = true;
      if (v) v(" my_node_num=!%08lx nodedb_count=%u reboot_count=%lu pio_env=%s",
               (unsigned long)m.my_node_num, (unsigned)m.nodedb_count,
               (unsigned long)m.reboot_count, oVacio(m.pio_env));
      break;
    }
    case meshtastic_FromRadio_metadata_tag: {
      const meshtastic_DeviceMetadata& m = fr.metadata;
      d.tieneFirmware = true;
      strncpy(d.firmware, m.firmware_version, sizeof d.firmware - 1);
      d.cambio = true;
      if (v) v(" firmware=%s hw_model=%s role=%s bluetooth=%d wifi=%d display=%d",
               oVacio(m.firmware_version), meshtastic_HardwareModel_name(m.hw_model),
               meshtastic_Config_DeviceConfig_Role_name(m.role),
               m.hasBluetooth, m.hasWifi, m.has_display);
      break;
    }
    case meshtastic_FromRadio_node_info_tag: {
      const meshtastic_NodeInfo& n = fr.node_info;
      d.nodosEnDb++;
      bool propio = d.tieneMiNodo && n.num == d.miNodo;
      if (v) {
        v(" num=!%08lx%s", (unsigned long)n.num, propio ? "(propio)" : "");
        if (n.has_user) v(" \"%s\" (%s) %s", n.user.long_name, n.user.short_name,
                          meshtastic_HardwareModel_name(n.user.hw_model));
        if (n.has_hops_away) v(" hops=%u", (unsigned)n.hops_away);
        v(" ch=%u", (unsigned)n.channel);
        if (n.last_heard) v(" last_heard=%lu", (unsigned long)n.last_heard);
        if (n.has_device_metrics) {
          v(" metrics:");
          if (propio) imprimirMetricas(n.device_metrics, v);
          else v("si");
        }
        if (n.has_position) {
          if (propio) { v(" pos:"); imprimirPosicion(n.position, v); }
          else v(" pos:si");
        }
      }
      if (!propio) {
        d.nodos.actualizar(n.num, n.has_user ? n.user.short_name : nullptr, n.has_hops_away, n.hops_away,
                           n.last_heard, n.via_mqtt);
        d.cambio = true;
      }
      if (propio) {
        if (n.has_user) {
          d.tieneUsuario = true;
          strncpy(d.nombreLargo, n.user.long_name, sizeof d.nombreLargo - 1);
          strncpy(d.nombreCorto, n.user.short_name, sizeof d.nombreCorto - 1);
          d.hwModel = n.user.hw_model;
        }
        if (n.has_device_metrics) tomarMetricas(n.device_metrics, d, ahora, true);
        if (n.has_position) tomarPosicion(n.position, d, ahora);
        d.cambio = true;
      }
      break;
    }
    case meshtastic_FromRadio_config_tag: {
      const meshtastic_Config& c = fr.config;
      uint32_t ct = c.which_payload_variant;
      if (ct < 16) est.porConfig[ct]++;
      if (v) v(".%s", nombreConfig(ct));
      if (ct == meshtastic_Config_device_tag) {
        if (v) v(" role=%s", meshtastic_Config_DeviceConfig_Role_name(c.payload_variant.device.role));
      } else if (ct == meshtastic_Config_position_tag) {
        const meshtastic_Config_PositionConfig& p = c.payload_variant.position;
        d.tieneCfgPosicion = true;
        d.gpsMode = p.gps_mode;
        d.posicionBroadcastS = p.position_broadcast_secs;
        d.gpsUpdateIntervalS = p.gps_update_interval;
        d.cambio = true;
        if (v) v(" gps_mode=%s position_broadcast_secs=%lu gps_update_interval=%lu",
                 meshtastic_Config_PositionConfig_GpsMode_name(p.gps_mode),
                 (unsigned long)p.position_broadcast_secs, (unsigned long)p.gps_update_interval);
      } else if (ct == meshtastic_Config_lora_tag) {
        if (v) v(" region=%s use_preset=%d modem_preset=%s",
                 meshtastic_Config_LoRaConfig_RegionCode_name(c.payload_variant.lora.region), c.payload_variant.lora.use_preset,
                 meshtastic_Config_LoRaConfig_ModemPreset_name(c.payload_variant.lora.modem_preset));
      } else if (ct == meshtastic_Config_bluetooth_tag) {
        // El PIN (fixed_pin) no se imprime a proposito.
        if (v) v(" enabled=%d mode=%s", c.payload_variant.bluetooth.enabled,
                 meshtastic_Config_BluetoothConfig_PairingMode_name(c.payload_variant.bluetooth.mode));
      }
      break;
    }
    case meshtastic_FromRadio_moduleConfig_tag: {
      const meshtastic_ModuleConfig& m = fr.moduleConfig;
      uint32_t mt = m.which_payload_variant;
      if (mt < 32) est.porModulo[mt]++;
      if (v) v(".%s", nombreModulo(mt));
      if (mt == meshtastic_ModuleConfig_telemetry_tag) {
        const meshtastic_ModuleConfig_TelemetryConfig& t = m.payload_variant.telemetry;
        d.tieneCfgTelemetria = true;
        d.ambienteActivado = t.environment_measurement_enabled;
        d.intervaloAmbiente = t.environment_update_interval;
        d.telemetriaDispositivoMesh = t.device_telemetry_enabled;
        d.cambio = true;
        if (v) v(" device_telemetry_enabled=%d device_update_interval=%lu"
                 " environment_measurement_enabled=%d environment_update_interval=%lu"
                 " environment_screen_enabled=%d power_measurement_enabled=%d",
                 t.device_telemetry_enabled, (unsigned long)t.device_update_interval,
                 t.environment_measurement_enabled, (unsigned long)t.environment_update_interval,
                 t.environment_screen_enabled, t.power_measurement_enabled);
      }
      break;
    }
    case meshtastic_FromRadio_channel_tag: {
      const meshtastic_Channel& c = fr.channel;
      // La PSK no se imprime: solo su tipo. Segun la doc de canales, una PSK de
      // 1 byte con valor 0x01 es la clave por defecto (publica, "AQ==").
      if (v) {
        v(" index=%d role=%s name=\"%s\"", c.index, meshtastic_Channel_Role_name(c.role),
          c.has_settings ? c.settings.name : "");
        if (c.has_settings) {
          const auto& k = c.settings.psk;
          if (k.size == 0) v(" psk=ninguna(sin cifrado)");
          else if (k.size == 1) v(" psk=corta(1 B, valor %u%s)", k.bytes[0], k.bytes[0] == 1 ? " = clave por defecto" : "");
          else v(" psk=propia(%u B)", (unsigned)k.size);
          v(" channel_num=%lu", (unsigned long)c.settings.channel_num);
        }
      }
      break;
    }
    case meshtastic_FromRadio_config_complete_id_tag:
      if (v) v(" %lu", (unsigned long)fr.config_complete_id);
      break;
    case meshtastic_FromRadio_queueStatus_tag:
      d.tieneQueueStatus = true;
      d.qsRes = fr.queueStatus.res;
      d.qsPacketId = fr.queueStatus.mesh_packet_id;
      d.qsContador++;
      if (v) v(" res=%ld free=%lu maxlen=%lu mesh_packet_id=%lu", (long)fr.queueStatus.res,
               (unsigned long)fr.queueStatus.free, (unsigned long)fr.queueStatus.maxlen,
               (unsigned long)fr.queueStatus.mesh_packet_id);
      break;
    case meshtastic_FromRadio_fileInfo_tag:
      if (v) v(" %s (%lu B)", fr.fileInfo.file_name, (unsigned long)fr.fileInfo.size_bytes);
      break;
    case meshtastic_FromRadio_clientNotification_tag:
      if (v) v(" \"%s\"", fr.clientNotification.message);
      break;
    case meshtastic_FromRadio_log_record_tag:
      if (v) v(" \"%s\"", fr.log_record.message);
      break;
    case meshtastic_FromRadio_packet_tag:
      procesarPaquete(fr.packet, d, est, ahora, v);
      break;
    default:
      break;
  }
  if (v) v("\n");
}

void imprimirResumen(const Estadisticas& est, const DatosTracker& d, FnLog log) {
  log("\n===== Resumen de FromRadio: %lu mensajes", (unsigned long)est.total);
  if (est.errores) log(", %lu sin decodificar", (unsigned long)est.errores);
  log(" =====\n");
  for (uint32_t t = 0; t < 32; t++) {
    if (!est.porVariante[t]) continue;
    log("  %-20s %4lu", nombreVariante(t), (unsigned long)est.porVariante[t]);
    if (t == meshtastic_FromRadio_config_tag) {
      log("  (");
      for (uint32_t c = 0; c < 16; c++)
        if (est.porConfig[c]) log(" %s", nombreConfig(c));
      log(" )");
    } else if (t == meshtastic_FromRadio_moduleConfig_tag) {
      log("  (");
      for (uint32_t m = 0; m < 32; m++)
        if (est.porModulo[m]) log(" %s", nombreModulo(m));
      log(" )");
    } else if (t == meshtastic_FromRadio_packet_tag) {
      log("  (");
      for (const auto& e : est.porPuerto)
        if (e.cuenta) log(" %s x%lu", meshtastic_PortNum_name((meshtastic_PortNum)e.portnum),
                          (unsigned long)e.cuenta);
      log(" )");
    }
    log("\n");
  }

  log("----- Datos del tracker -----\n");
  if (d.tieneMiNodo) log("  nodo: !%08lx", (unsigned long)d.miNodo);
  if (d.tieneUsuario) log("  \"%s\" (%s) %s", d.nombreLargo, d.nombreCorto,
                          meshtastic_HardwareModel_name((meshtastic_HardwareModel)d.hwModel));
  if (d.tieneFirmware) log("  firmware %s", d.firmware);
  log("\n  nodos en la base: %u\n", (unsigned)d.nodosEnDb);
  log("  bateria: ");
  if (d.tieneBateria) log("%lu%%%s", (unsigned long)d.bateria, d.bateria > 100 ? " (USB)" : "");
  else log("sin dato");
  if (d.tieneVoltaje) log("  %.3f V", d.voltaje);
  log("\n  uso canal: ");
  if (d.tieneUsoCanal) log("%.2f%%", d.usoCanal); else log("sin dato");
  if (d.tieneAirTx) log("  air_util_tx %.2f%%", d.airTx);
  if (d.tieneUptime) log("  uptime %lus", (unsigned long)d.uptime);
  log("\n  posicion: ");
  if (d.tienePosicion) log("%.7f, %.7f  sats=%lu", d.latitudI * 1e-7, d.longitudI * 1e-7,
                           (unsigned long)d.satelites);
  else log("sin dato");
  if (d.tieneCfgPosicion) log("  (gps_mode=%s)",
                              meshtastic_Config_PositionConfig_GpsMode_name(
                                  (meshtastic_Config_PositionConfig_GpsMode)d.gpsMode));
  log("\n  temperatura/luz: ");
  if (d.tieneTemperatura || d.tieneLuz) {
    if (d.tieneTemperatura) log("%.2f C  ", d.temperatura);
    if (d.tieneLuz) log("luz %.1f (0-100)", d.luz);
  } else if (d.tieneCfgTelemetria && !d.ambienteActivado) {
    log("desactivado (environment_measurement_enabled=false)");
  } else {
    log("sin dato todavia");
  }
  log("\n");
}
