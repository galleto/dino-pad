// secretos.ejemplo.h - Plantilla. Copiala como secretos.h (mismo directorio) y llenala.
// secretos.h esta en .gitignore: NUNCA se sube al repo.
// Sin secretos.h el sketch compila igual, con la red APAGADA (solo pantalla y BLE).
#pragma once

// Wi-Fi: la red necesita salida a internet (sin portal de inicio de sesion).
#define WIFI_SSID   ".:PC Puma FI:."
#define WIFI_PASS   ""                      // "" = red abierta

// Broker MQTT en la nube (HiveMQ Cloud: Cluster > Overview > Host). Puerto TLS 8883.
#define MQTT_HOST   "xxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT   8883
#define MQTT_USER   "dinopad-esp32"         // credencial con permiso de PUBLICAR
#define MQTT_PASS   "cambia-esto"

// Tripulante que lleva este DINO PAD (crewId del contrato: comandante, botanico, ingeniero)
#define CREW_ID     "comandante"
