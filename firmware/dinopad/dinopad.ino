#include <WiFi.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <sys/time.h>
#include <time.h>
#include <atomic>
#include <pines.h>   // firmware/libraries/dinopad_pines: pantalla y botones

#include "mqtt_client.h"   // esp-mqtt de ESP-IDF (incluido en el core): publica con QoS 1
#include "contrato.h"      // mensajes de docs/contrato-datos.md (probados: test/verificar_contrato.sh)

// ===== DRIVER DE LA PANTALLA =====
// 0 = ILI9341   1 = ST7789
#define DRIVER 0   // pantalla roja 2.8" = ILI9341

#if DRIVER == 0
  #include <Adafruit_ILI9341.h>
#else
  #include <Adafruit_ST7789.h>
#endif

// ===== WI-FI Y BROKER MQTT =====
const char* ssid        = ".:PC Puma FI:.";
const char* password    = "";                // red abierta, sin contraseña
const char* mqtt_server = "10.105.67.207"; // IPv4 de la PC en "PC Puma FI" (DHCP: revisar si cambia)
const int   mqtt_port   = 1883;

// ===== IDENTIDAD (docs/contrato-datos.md) =====
static const char* CREW_ID   = "comandante";   // comandante | botanico | ingeniero
static const char* DEVICE_ID = "dinopad-01";   // tambien es el client id MQTT

// ===== HORA (NTP, UTC) =====
// El contrato pide epoch en ms de cuando se mide. Sin NTP no hay hora: las
// lecturas se descartan y el SOS/ping se manda igual con timestamp 0.
static const char* NTP_1 = "pool.ntp.org";
static const char* NTP_2 = "time.nist.gov";
static const time_t EPOCH_MINIMO = 1700000000;   // antes de esto = reloj sin sincronizar

// ===== ESTADO DEL DISPOSITIVO =====
static const uint32_t ESTADO_CADA_MS = 30000;
// El DINO PAD no tiene pin para medir la bateria (Hardware/Hardware/datasheets/PINOUTS.xlsx)
// y DeviceStatus exige batteryPct 0..100: mientras devuelva -1, dinopad/estado NO se
// publica (no se inventa el dato). Conectar aqui el ADC cuando exista el divisor.
static int leerBateriaPct() { return -1; }

// ===== PINES Y PANTALLA =====
// Pines, rotacion, MADCTL y SPI vienen de pines.h. Botones (medidos con
// firmware/test_botones): NEGRO=13, BLANCO=26, ROJO=14.
#define ROTACION     TFT_ROTACION
#if DRIVER == 0
  #define MADCTL_VALOR TFT_MADCTL   // ILI9341: 0x48 (pines.h)
#else
  #define MADCTL_VALOR 0x68         // ST7789: valor del sketch original (sin probar aqui)
#endif
#define SPI_FREQ     TFT_SPI_FREQ

#if DRIVER == 0
  Adafruit_ILI9341 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
#else
  Adafruit_ST7789 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
#endif

// ===== PALETA DE COLORES (RGB565) =====
#define COL_FONDO      0x0000
#define COL_VERDE      0x07E0
#define COL_VERDE_OSC  0x0240
#define COL_CIAN       0x07FF
#define COL_AMARILLO   0xFFE0
#define COL_ROJO       0xF800
#define COL_BLANCO     0xFFFF
#define COL_GRIS       0x8410

// ===== MQTT (esp-mqtt) =====
// Los eventos llegan en la tarea de esp-mqtt: solo tocan estas variables y
// loop() es quien escribe en pantalla/serial.
static esp_mqtt_client_handle_t mqtt = nullptr;
static std::atomic<bool> mqttConectado{false};
static std::atomic<int> mqttUltimoAck{-1};       // msg_id del ultimo PUBACK (QoS 1)
static std::atomic<int> mqttErrores{0};
static int idUltimoSos = -1;
static char mqttUri[64];

// ===== DISENO (320 x 240, horizontal) =====
// Fuente por defecto: 6x8 px por caracter * tamano.
//   0-24    barra: "DINOPAD OS" (tamano 2) + "// TELEMETRIA" + segundos encendido
//   34-106  estado: Wi-Fi, IP, broker, MQTT y botones (etiqueta x=8, valor x=X_VALOR)
//   116-239 consola: 8 lineas de 50 caracteres
#define ANCHO        320
#define ALTO         240
#define X_VALOR      80    // valores de estado: max (316-80)/6 = 39 caracteres
#define ANCHO_VALOR  (ANCHO - X_VALOR - 4)
#define Y_CONSOLA    116
#define ALTO_LINEA   12
#define CHARS_CONSOLA 50   // (ANCHO - 2*6 - 8) / 6

// ===== BUFFER DE CONSOLA EN PANTALLA =====
#define MAX_LOGS 8         // 8 lineas: y = 135 .. 219 (+8 px) dentro del marco
String consolaLogs[MAX_LOGS];
uint16_t consolaColor[MAX_LOGS];

// Estados previos para evitar parpadeo en pantalla
int ultimoEstadoWifi = -1;
int ultimoEstadoMqtt = -1;     // -1 = forzar dibujo
int ultimoNtp = -1;
unsigned long ultimoRefrescoUi = 0;

void actualizarPanelEstado(bool forzar = false);   // declaracion adelantada

const char* textoWifi(int st) {
  switch (st) {
    case WL_NO_SSID_AVAIL:   return "no encuentra la red";
    case WL_CONNECT_FAILED:  return "falla al conectar";
    case WL_CONNECTION_LOST: return "conexion perdida";
    case WL_DISCONNECTED:    return "desconectado";
    case WL_IDLE_STATUS:     return "esperando";
    default:                 return "?";
  }
}

void conectarWifi() {
  if (strlen(password) == 0) WiFi.begin(ssid);          // red abierta
  else                       WiFi.begin(ssid, password);
}

// ---------- Hora ----------
static bool horaSincronizada() { return time(nullptr) >= EPOCH_MINIMO; }

// Epoch en ms (0 si el reloj no esta sincronizado)
static uint64_t horaMs() {
  if (!horaSincronizada()) return 0;
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000);
}

// ---------- MQTT ----------
static void eventoMqtt(void*, esp_event_base_t, int32_t id, void* datos) {
  esp_mqtt_event_handle_t e = (esp_mqtt_event_handle_t)datos;
  switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:    mqttConectado = true; break;
    case MQTT_EVENT_DISCONNECTED: mqttConectado = false; break;
    case MQTT_EVENT_PUBLISHED:    mqttUltimoAck = e->msg_id; break;   // PUBACK de un QoS 1
    case MQTT_EVENT_ERROR:        mqttErrores++; break;
    default: break;
  }
}

// Arranca NTP y el cliente MQTT la primera vez que hay Wi-Fi. esp-mqtt se
// reconecta solo (cada 5 s) si se cae el broker o el Wi-Fi.
static void iniciarRed() {
  if (mqtt) return;
  configTime(0, 0, NTP_1, NTP_2);
  registrarEvento(String("NTP: sincronizando con ") + NTP_1);

  snprintf(mqttUri, sizeof mqttUri, "mqtt://%s:%d", mqtt_server, mqtt_port);
  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.uri = mqttUri;
  cfg.credentials.client_id = DEVICE_ID;
  cfg.session.keepalive = 30;
  cfg.network.reconnect_timeout_ms = 5000;
  mqtt = esp_mqtt_client_init(&cfg);
  if (!mqtt) { registrarEvento("ERR: no se pudo crear el cliente MQTT"); return; }
  esp_mqtt_client_register_event(mqtt, MQTT_EVENT_ANY, eventoMqtt, nullptr);
  esp_mqtt_client_start(mqtt);
  registrarEvento(String("MQTT: conectando a ") + mqttUri);
}

// Publica un mensaje del contrato. QoS 1 se encola en el outbox de esp-mqtt:
// si no hay conexion se manda al reconectar (sin retain).
static void publicar(const char* topico, const char* json, int qos) {
  if (!mqtt) { registrarEvento(String("ERR: sin MQTT para ") + topico); return; }
  int id;
  if (qos > 0) {
    id = esp_mqtt_client_enqueue(mqtt, topico, json, 0, qos, contrato::RETAIN, true);
  } else {
    if (!mqttConectado) { registrarEvento(String("ERR: sin conexion, no se envio ") + topico); return; }
    id = esp_mqtt_client_publish(mqtt, topico, json, 0, qos, contrato::RETAIN);
  }
  if (id < 0) {
    registrarEvento(String("ERR: fallo al publicar en ") + topico + (id == -2 ? " (outbox lleno)" : ""));
    return;
  }
  registrarEvento(String("TX q") + qos + ": " + topico + " " + json);
  if (strcmp(topico, contrato::TOPICO_ALERTAS) == 0 && strstr(json, "\"sos\"")) idUltimoSos = id;
}

// Cambios de conexion, PUBACK del SOS, NTP y estado periodico (desde loop)
static void gestionarRed() {
  if (WiFi.status() == WL_CONNECTED) iniciarRed();

  static int ackVisto = -1;
  int ack = mqttUltimoAck;
  if (ack != ackVisto) {
    ackVisto = ack;
    if (ack == idUltimoSos) registrarEvento("OK: el broker confirmo el SOS (PUBACK)");
  }

  static bool avisoNtp = false;
  if (!avisoNtp && horaSincronizada()) {
    avisoNtp = true;
    registrarEvento("OK: hora NTP sincronizada");
  }

  static uint32_t ultimoEstado = 0;
  static bool avisoBateria = false;
  if (mqttConectado && horaSincronizada() && millis() - ultimoEstado >= ESTADO_CADA_MS) {
    ultimoEstado = millis();
    char json[200];
    size_t n = contrato::estado(json, sizeof json, DEVICE_ID, CREW_ID, "online", leerBateriaPct(),
                                (int)WiFi.RSSI(), horaMs());
    if (n) publicar(contrato::TOPICO_ESTADO, json, contrato::QOS_ESTADO);
    else if (!avisoBateria) {
      avisoBateria = true;
      registrarEvento("estado no publicado: sin medicion de bateria (el contrato exige batteryPct)");
    }
  }
}

void redibujarConsola() {
  // Area interior de la consola, debajo de su encabezado
  tft.fillRect(5, Y_CONSOLA + 16, ANCHO - 10, ALTO - Y_CONSOLA - 17, COL_FONDO);
  tft.setTextSize(1);
  for (int i = 0; i < MAX_LOGS; i++) {
    if (consolaLogs[i].length() > 0) {
      tft.setTextColor(consolaColor[i], COL_FONDO);
      tft.setCursor(8, Y_CONSOLA + 19 + (i * ALTO_LINEA));
      tft.print(consolaLogs[i]);
    }
  }
}

static void agregarLineaConsola(const String& linea, uint16_t color) {
  for (int i = 0; i < MAX_LOGS - 1; i++) {
    consolaLogs[i] = consolaLogs[i + 1];
    consolaColor[i] = consolaColor[i + 1];
  }
  consolaLogs[MAX_LOGS - 1] = linea;
  consolaColor[MAX_LOGS - 1] = color;
}

void registrarEvento(const String& msg) {
  Serial.println(msg);

  // Color segun el mensaje completo (asi las lineas de continuacion lo conservan)
  uint16_t color = COL_BLANCO;
  if (msg.indexOf("ERR") >= 0 || msg.indexOf("SOS") >= 0) color = COL_ROJO;
  else if (msg.indexOf("OK") >= 0 || msg.indexOf("TX:") >= 0) color = COL_VERDE;

  // Partir en lineas de CHARS_CONSOLA (la primera con "> ", las demas con "  ").
  // Maximo 3 lineas por mensaje para que uno largo no borre toda la consola.
  String resto = msg;
  for (int n = 0; n < 3 && resto.length() > 0; n++) {
    String prefijo = (n == 0) ? "> " : "  ";
    int cabe = CHARS_CONSOLA - 2;
    String trozo;
    if ((int)resto.length() <= cabe) {
      trozo = resto;
      resto = "";
    } else if (n == 2) {
      trozo = resto.substring(0, cabe - 3) + "...";
      resto = "";
    } else {
      trozo = resto.substring(0, cabe);
      resto = resto.substring(cabe);
    }
    agregarLineaConsola(prefijo + trozo, color);
  }
  redibujarConsola();
}

void dibujarInterfazBase() {
  tft.fillScreen(COL_FONDO);

  if (tft.width() != ANCHO || tft.height() != ALTO) {
    Serial.printf("AVISO pantalla: ROTACION %d da %dx%d, el diseno es %dx%d\n",
                  ROTACION, tft.width(), tft.height(), ANCHO, ALTO);
  }

  // Barra superior: "DINOPAD OS" (tamano 2, 120 px) + "// TELEMETRIA" (tamano 1)
  // + segundos encendido a la derecha (los escribe loop() en x=274)
  tft.fillRect(0, 0, ANCHO, 24, COL_VERDE_OSC);
  tft.drawFastHLine(0, 24, ANCHO, COL_VERDE);
  tft.setTextSize(2);
  tft.setTextColor(COL_VERDE, COL_VERDE_OSC);
  tft.setCursor(8, 5);
  tft.print("DINOPAD OS");
  tft.setTextSize(1);
  tft.setCursor(136, 9);
  tft.print("// TELEMETRIA");

  // Etiquetas fijas de estado
  tft.setTextSize(1);
  tft.setTextColor(COL_GRIS, COL_FONDO);
  tft.setCursor(8, 34);  tft.print("RED WI-FI :");
  tft.setCursor(8, 50);  tft.print("IP LOCAL  :");
  tft.setCursor(8, 66);  tft.print("BROKER    :");
  tft.setCursor(8, 82);  tft.print("MQTT      :");
  tft.setCursor(8, 98);  tft.print("BOTONES   :");

  // Valores estáticos
  tft.setTextColor(COL_CIAN, COL_FONDO);
  tft.setCursor(X_VALOR, 34); tft.print(ssid);
  tft.setCursor(X_VALOR, 66); tft.print(String(mqtt_server) + ":" + String(mqtt_port));

  // Leyenda de botones junto a su etiqueta (32 caracteres = 192 px, hasta x=272)
  tft.setTextColor(COL_BLANCO, COL_FONDO);
  tft.setCursor(X_VALOR, 98); tft.print("[NEG]Ping [BLA]Vitales DEMO [ROJ]SOS");

  // Marco de la consola inferior (hasta el borde de abajo)
  tft.drawRect(2, Y_CONSOLA, ANCHO - 4, ALTO - Y_CONSOLA, COL_VERDE);
  tft.fillRect(2, Y_CONSOLA, ANCHO - 4, 15, COL_VERDE_OSC);
  tft.setTextColor(COL_VERDE, COL_VERDE_OSC);
  tft.setCursor(8, Y_CONSOLA + 4);
  tft.print("MONITOR SERIAL EN VIVO");
}

void actualizarPanelEstado(bool forzar) {
  int estadoWifi = WiFi.status();
  int estadoMqtt = mqttConectado ? 1 : 0;
  int ntp = horaSincronizada() ? 1 : 0;

  // Actualizar IP / Estado Wi-Fi solo si cambió
  if (forzar || estadoWifi != ultimoEstadoWifi) {
    tft.fillRect(X_VALOR, 48, ANCHO_VALOR, 12, COL_FONDO);
    tft.setTextSize(1);
    tft.setCursor(X_VALOR, 50);
    if (estadoWifi == WL_CONNECTED) {
      tft.setTextColor(COL_VERDE, COL_FONDO);
      tft.print(WiFi.localIP().toString() + " (OK)");
      if (ultimoEstadoWifi != WL_CONNECTED) {
        registrarEvento("OK: WiFi conectado (" + WiFi.localIP().toString() + ")");
      }
    } else {
      tft.setTextColor(COL_AMARILLO, COL_FONDO);
      tft.print(String(textoWifi(estadoWifi)) + "...");   // max 22 caracteres
    }
    ultimoEstadoWifi = estadoWifi;
  }

  // Actualizar Estado MQTT y NTP solo si cambiaron
  if (forzar || estadoMqtt != ultimoEstadoMqtt || ntp != ultimoNtp) {
    if (ultimoEstadoMqtt != -1 && estadoMqtt != ultimoEstadoMqtt)
      registrarEvento(estadoMqtt ? "OK: MQTT conectado" : "ERR: MQTT desconectado (reintentando)");
    tft.fillRect(X_VALOR, 80, ANCHO_VALOR, 12, COL_FONDO);
    tft.setTextSize(1);
    tft.setCursor(X_VALOR, 82);
    tft.setTextColor(estadoMqtt ? COL_VERDE : COL_ROJO, COL_FONDO);
    tft.print(estadoMqtt ? "CONECTADO" : "DESCONECTADO");
    tft.setTextColor(ntp ? COL_VERDE : COL_AMARILLO, COL_FONDO);
    tft.print(ntp ? "  | NTP OK" : "  | sin hora NTP");
    ultimoEstadoMqtt = estadoMqtt;
    ultimoNtp = ntp;
  }
}

void revisarBotones() {
  static bool prevNegro = false, prevBlanco = false, prevRojo = false;
  static unsigned long tDebounce = 0;

  if (millis() - tDebounce < 60) return;

  bool negro  = !digitalRead(PIN_BTN_NEGRO);
  bool blanco = !digitalRead(PIN_BTN_BLANCO);
  bool rojo   = !digitalRead(PIN_BTN_ROJO);

  char json[200];
  // NEGRO: ping de enlace (QoS 1). Sin NTP se manda igual con timestamp 0.
  if (negro && !prevNegro) {
    tDebounce = millis();
    if (contrato::alerta(json, sizeof json, CREW_ID, "ping", horaMs()))
      publicar(contrato::TOPICO_ALERTAS, json, contrato::QOS_ALERTAS);
  }
  // BLANCO: BPM y SpO2 SIMULADOS (source "simulated") hasta tener el MAX30102.
  // Sin hora NTP no se mandan: el contrato pide la hora de la medicion.
  if (blanco && !prevBlanco) {
    tDebounce = millis();
    uint64_t ts = horaMs();
    if (!ts) {
      registrarEvento("ERR: sin hora NTP, lecturas no enviadas");
    } else {
      if (contrato::lecturaVital(json, sizeof json, CREW_ID, "hr", true, (int)random(72, 96), "lpm", ts,
                                 contrato::SOURCE_SIMULATED, contrato::QUALITY_OK))
        publicar(contrato::TOPICO_VITALS, json, contrato::QOS_VITALS);
      if (contrato::lecturaVital(json, sizeof json, CREW_ID, "spo2", true, (int)random(96, 100), "%", ts,
                                 contrato::SOURCE_SIMULATED, contrato::QUALITY_OK))
        publicar(contrato::TOPICO_VITALS, json, contrato::QOS_VITALS);
    }
  }
  // ROJO: SOS (QoS 1, sin retain). Nunca se descarta: sin NTP va con timestamp 0
  // y, si no hay conexion, queda en el outbox hasta reconectar.
  if (rojo && !prevRojo) {
    tDebounce = millis();
    uint64_t ts = horaMs();
    if (!ts) registrarEvento("SOS SIN HORA NTP: se envia con timestamp 0");
    if (contrato::alerta(json, sizeof json, CREW_ID, "sos", ts))
      publicar(contrato::TOPICO_ALERTAS, json, contrato::QOS_ALERTAS);
  }

  prevNegro = negro;
  prevBlanco = blanco;
  prevRojo = rojo;
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_BTN_NEGRO, INPUT_PULLUP);
  pinMode(PIN_BTN_BLANCO, INPUT_PULLUP);
  pinMode(PIN_BTN_ROJO, INPUT_PULLUP);

#if DRIVER == 0
  tft.begin(SPI_FREQ);
#else
  tft.init(240, 320);
  tft.setSPISpeed(SPI_FREQ);
#endif
  tft.setRotation(ROTACION);            // la libreria queda en 320x240
  uint8_t madctl = MADCTL_VALOR;
  tft.sendCommand(0x36, &madctl, 1);    // orientacion real del panel (justo despues)
  Serial.printf("Pantalla: SPI %lu Hz, setRotation(%d) + MADCTL 0x%02X -> width()=%d height()=%d (diseno %dx%d)\n",
                (unsigned long)SPI_FREQ, ROTACION, MADCTL_VALOR, tft.width(), tft.height(), ANCHO, ALTO);

  dibujarInterfazBase();
  registrarEvento("Sistema Dinopad iniciado.");

  WiFi.mode(WIFI_STA);
  conectarWifi();
  registrarEvento("Buscando red WiFi...");

  actualizarPanelEstado(true);   // NTP y MQTT arrancan en gestionarRed() al haber Wi-Fi
}

void loop() {
  // Reintenta el Wi-Fi si no conecta
  static unsigned long tWifi = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - tWifi > 15000) {
    tWifi = millis();
    registrarEvento("WiFi: reintentando...");
    WiFi.disconnect();
    conectarWifi();
  }

  gestionarRed();
  revisarBotones();

  // Actualizar estado y reloj de actividad cada 500ms
  if (millis() - ultimoRefrescoUi >= 500) {
    ultimoRefrescoUi = millis();
    actualizarPanelEstado();

    // Mostrar segundos encendido en la esquina superior derecha
    tft.setTextSize(1);
    tft.setTextColor(COL_BLANCO, COL_VERDE_OSC);
    tft.setCursor(274, 9);                 // 6 caracteres: 274..310
    tft.printf("%5lus", millis() / 1000);
  }
}