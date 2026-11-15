#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <Adafruit_GFX.h>

// ===== DRIVER DE LA PANTALLA =====
// 0 = ILI9341   1 = ST7789
#define DRIVER 0   // pantalla roja 2.8" = ILI9341

#if DRIVER == 0
  #include <Adafruit_ILI9341.h>
#else
  #include <Adafruit_ST7789.h>
#endif

// ===== WI-FI Y BROKER HIVEMQ =====
const char* ssid        = ".:PC Puma FI:.";
const char* password    = "";                // red abierta, sin contraseña
const char* mqtt_server = "10.105.67.207"; // IPv4 de la PC en "PC Puma FI" (DHCP: revisar si cambia)
const int   mqtt_port   = 1883;

// ===== PINES (tu cableado) =====
#define TFT_CS      5
#define TFT_DC      2
#define TFT_RST     4
#define BTN_NEGRO   13
#define BTN_BLANCO  14
#define BTN_ROJO    26

// ===== CONFIGURACIÓN PANTALLA =====
// Orientacion (firmware/test_geometria y firmware/test_madctl): el panel es
// 320x240 "nativo". setRotation(1) deja la libreria en 320x240 y JUSTO DESPUES
// se escribe MADCTL (0x36): horizontal, sin espejo, (0,0) arriba a la izquierda.
#define ROTACION     1
#if DRIVER == 0
  #define MADCTL_VALOR 0x48   // ILI9341: valor elegido con test_madctl
#else
  #define MADCTL_VALOR 0x68   // ST7789: valor del sketch original (sin probar aqui)
#endif
#define SPI_FREQ     10000000   // 10 MHz, como en test_madctl y ble_send

#if DRIVER == 0
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
#else
  Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
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

WiFiClient espClient;
PubSubClient client(espClient);

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
bool ultimoEstadoMqtt = false;
int ultimoRcMqtt = 999;
unsigned long ultimoRefrescoUi = 0;
unsigned long ultimoIntentoMqtt = 0;

void actualizarPanelEstado(bool forzar = false);   // declaracion adelantada

const char* textoRc(int rc) {
  switch (rc) {
    case -4: return "timeout, broker sin respuesta";
    case -3: return "conexion perdida";
    case -2: return "fallo de red (IP/firewall)";
    case -1: return "desconectado";
    case  1: return "protocolo rechazado";
    case  2: return "client ID rechazado";
    case  3: return "broker no disponible";
    case  4: return "usuario/clave incorrectos";
    case  5: return "no autorizado (allow-all?)";
    default: return "";
  }
}

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

void gestionarConexionMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (client.connected()) { client.loop(); return; }

  unsigned long ahora = millis();
  if (ahora - ultimoIntentoMqtt < 5000) return;
  ultimoIntentoMqtt = ahora;

  // 1) ¿El ESP32 esta en la misma red que el broker?
  IPAddress ipBroker;
  ipBroker.fromString(mqtt_server);
  uint32_t mask = (uint32_t)WiFi.subnetMask();
  bool mismaRed = ((uint32_t)WiFi.localIP() & mask) == ((uint32_t)ipBroker & mask);
  registrarEvento("ESP32 " + WiFi.localIP().toString() + (mismaRed ? " (misma red)" : " (OTRA RED!)"));

  // 2) Prueba TCP pura al puerto del broker (sin MQTT)
  WiFiClient prueba;
  if (!prueba.connect(ipBroker, mqtt_port, 3000)) {
    registrarEvento("ERR: no llega a " + String(mqtt_server) + ":" + String(mqtt_port));
    registrarEvento("-> firewall de la PC, IP o broker apagado");
    actualizarPanelEstado();
    return;
  }
  prueba.stop();
  registrarEvento("OK: puerto " + String(mqtt_port) + " abierto");

  // 3) Ahora si, MQTT
  String clientId = "Dinopad-ESP32-" + String(random(0xffff), HEX);
  registrarEvento("Conectando a HiveMQ...");
  if (client.connect(clientId.c_str())) {
    registrarEvento("OK: Conectado a broker HiveMQ");
    publicarDato("dinopad/estado", "{\"device\":\"Dinopad\",\"status\":\"ONLINE\"}");
  } else {
    int rc = client.state();
    registrarEvento("ERR: rc=" + String(rc) + " " + textoRc(rc));
  }
  actualizarPanelEstado();
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
  tft.setCursor(X_VALOR, 98); tft.print("[NEG]Ping [BLA]Sensores [ROJ]SOS");

  // Marco de la consola inferior (hasta el borde de abajo)
  tft.drawRect(2, Y_CONSOLA, ANCHO - 4, ALTO - Y_CONSOLA, COL_VERDE);
  tft.fillRect(2, Y_CONSOLA, ANCHO - 4, 15, COL_VERDE_OSC);
  tft.setTextColor(COL_VERDE, COL_VERDE_OSC);
  tft.setCursor(8, Y_CONSOLA + 4);
  tft.print("MONITOR SERIAL EN VIVO");
}

void actualizarPanelEstado(bool forzar) {
  int estadoWifi = WiFi.status();
  bool estadoMqtt = client.connected();
  int rcActual = client.state();

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

  // Actualizar Estado MQTT solo si cambió
  if (forzar || estadoMqtt != ultimoEstadoMqtt || rcActual != ultimoRcMqtt) {
    tft.fillRect(X_VALOR, 80, ANCHO_VALOR, 12, COL_FONDO);
    tft.setTextSize(1);
    tft.setCursor(X_VALOR, 82);
    if (estadoMqtt) {
      tft.setTextColor(COL_VERDE, COL_FONDO);
      tft.print("CONECTADO (Activo)");
    } else {
      tft.setTextColor(COL_ROJO, COL_FONDO);
      tft.print("DESCONECTADO (rc=" + String(rcActual) + ")");
    }
    ultimoEstadoMqtt = estadoMqtt;
    ultimoRcMqtt = rcActual;
  }
}

void publicarDato(const char* topico, const String& payload) {
  if (client.connected()) {
    bool enviado = client.publish(topico, payload.c_str());
    if (enviado) {
      registrarEvento("TX: " + String(topico) + " -> " + payload);
    } else {
      registrarEvento("ERR: Fallo al publicar en " + String(topico));
    }
  } else {
    registrarEvento("ERR: Sin MQTT para enviar " + String(topico));
  }
}

void revisarBotones() {
  static bool prevNegro = false, prevBlanco = false, prevRojo = false;
  static unsigned long tDebounce = 0;

  if (millis() - tDebounce < 60) return;

  bool negro  = !digitalRead(BTN_NEGRO);
  bool blanco = !digitalRead(BTN_BLANCO);
  bool rojo   = !digitalRead(BTN_ROJO);

  if (negro && !prevNegro) {
    tDebounce = millis();
    publicarDato("dinopad/estado", "{\"evento\":\"PING\",\"uptime_s\":" + String(millis() / 1000) + "}");
  }
  if (blanco && !prevBlanco) {
    tDebounce = millis();
    int bpmSim = random(72, 96);
    int spo2Sim = random(96, 100);
    String json = "{\"bpm\":" + String(bpmSim) + ",\"spo2\":" + String(spo2Sim) + ",\"modo\":\"DEMO\"}";
    publicarDato("dinopad/sensores", json);
  }
  if (rojo && !prevRojo) {
    tDebounce = millis();
    publicarDato("dinopad/alertas", "{\"alerta\":\"SOS\",\"prioridad\":\"ALTA\"}");
  }

  prevNegro = negro;
  prevBlanco = blanco;
  prevRojo = rojo;
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(BTN_NEGRO, INPUT_PULLUP);
  pinMode(BTN_BLANCO, INPUT_PULLUP);
  pinMode(BTN_ROJO, INPUT_PULLUP);

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

  client.setServer(mqtt_server, mqtt_port);
  client.setSocketTimeout(5);
  actualizarPanelEstado(true);
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

  gestionarConexionMqtt();
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