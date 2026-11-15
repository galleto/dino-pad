// secretos.ejemplo.h - Plantilla. Copiala como secretos.h (mismo directorio) y llenala.
// secretos.h esta en .gitignore: NUNCA se sube al repo.
// Sin secretos.h el sketch compila igual, con la red APAGADA (solo pantalla y BLE).
#pragma once

// Wi-Fi: la red necesita salida a internet (sin portal de inicio de sesion).
#define WIFI_SSID   ".:PC Puma FI:."
#define WIFI_PASS   ""                      // "" = red abierta

// MODO HTTPS (recomendado): directo al backend en Render, sin broker.
// BASE_URL: la URL del servicio en Render, sin "/" al final.
// DEVICE_TOKEN: Render > dinopad-backend > Environment > DEVICE_TOKEN (copiarla tal cual).
#define BASE_URL      "https://dinopad-backend.onrender.com"
#define DEVICE_TOKEN  "pega-aqui-el-DEVICE_TOKEN"

// MODO MQTT (alternativa, p. ej. un broker local): borra BASE_URL de arriba y usa esto.
// #define MQTT_HOST   "192.168.1.10"
// #define MQTT_PORT   8883
// #define MQTT_USER   "dinopad-esp32"
// #define MQTT_PASS   "cambia-esto"

// Tripulante que lleva este DINO PAD (crewId del contrato: comandante, botanico, ingeniero)
#define CREW_ID     "comandante"
