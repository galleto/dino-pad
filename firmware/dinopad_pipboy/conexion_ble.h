// conexion_ble.h - Conexion BLE al T1000-E (Meshtastic) en una tarea FreeRTOS
// propia (nucleo 0), para que nunca bloquee el bucle de botones y pantalla.
//
// Secuencia (como ble_send): escanear la MAC -> conectar -> emparejar con PIN
// -> servicio Meshtastic -> want_config_id -> leer FromRadio hasta vacio ->
// escuchar (FromNum + sondeo). Si el tracker cierra el BLE, espera y reintenta.
//
// Solo escribe en ToRadio want_config_id (configuracion local, no sale por
// radio). No envia mensajes ni cambia la configuracion del tracker.
#pragma once

void bleIniciar();   // crea la tarea; llamar una vez en setup() tras compartidoIniciar()
