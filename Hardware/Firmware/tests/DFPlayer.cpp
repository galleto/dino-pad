#include <Arduino.h>
#include <DFRobotDFPlayerMini.h>

// Segun tu tabla: RX del modulo -> GPIO16 y TX del modulo -> GPIO17.
// Entonces el ESP32 TRANSMITE por GPIO16 y RECIBE por GPIO17
// (inverso al Serial2 por defecto). Si no responde, intercambia estos dos numeros.
#define PIN_ESP_TX 16   // va al RX del MP3-TF-16P
#define PIN_ESP_RX 17   // viene del TX del MP3-TF-16P

DFRobotDFPlayerMini mp3;
int volumen = 15;       // 0 a 30

void ayuda() {
  Serial.println("\nComandos (escribe y pulsa Enter):");
  Serial.println("  1, 2, 3...  reproduce esa pista (0001.mp3, 0002.mp3...)");
  Serial.println("  p pausa | r reanudar | n siguiente | b anterior");
  Serial.println("  + / - volumen | i informacion | ? ayuda");
}

void informacion() {
  // En la SD el estado suele ser: 512 detenido, 513 reproduciendo, 514 pausa
  Serial.printf("Estado: %d\n", mp3.readState());
  Serial.printf("Volumen: %d\n", mp3.readVolume());
  Serial.printf("Archivos en la microSD: %d\n", mp3.readFileCounts());
  Serial.printf("Pista actual: %d\n", mp3.readCurrentFileNumber());
}

void detalle(uint8_t tipo, int valor) {
  switch (tipo) {
    case TimeOut:              Serial.println("Tiempo de espera agotado"); break;
    case WrongStack:           Serial.println("Trama incorrecta"); break;
    case DFPlayerCardInserted: Serial.println("Tarjeta insertada"); break;
    case DFPlayerCardRemoved:  Serial.println("Tarjeta retirada"); break;
    case DFPlayerCardOnline:   Serial.println("Tarjeta en linea"); break;
    case DFPlayerPlayFinished: Serial.printf("Pista %d terminada\n", valor); break;
    case DFPlayerError:
      Serial.print("Error del modulo: ");
      switch (valor) {
        case Busy:             Serial.println("no encuentra la tarjeta SD"); break;
        case Sleeping:         Serial.println("en reposo"); break;
        case SerialWrongStack: Serial.println("trama serial incorrecta"); break;
        case CheckSumNotMatch: Serial.println("checksum no coincide"); break;
        case FileIndexOut:     Serial.println("numero de pista fuera de rango"); break;
        case FileMismatch:     Serial.println("no encuentra el archivo"); break;
        case Advertise:        Serial.println("reproduciendo anuncio"); break;
        default:               Serial.println(valor); break;
      }
      break;
    default: break;
  }
}

void comando(String s) {
  s.trim();
  if (s.length() == 0) return;
  if (isDigit(s[0])) {
    int n = s.toInt();
    Serial.printf("Reproduciendo pista %d\n", n);
    mp3.play(n);
    return;
  }
  switch (s[0]) {
    case 'p': mp3.pause();    Serial.println("Pausa"); break;
    case 'r': mp3.start();    Serial.println("Reanudar"); break;
    case 'n': mp3.next();     Serial.println("Siguiente"); break;
    case 'b': mp3.previous(); Serial.println("Anterior"); break;
    case '+': volumen = min(30, volumen + 3); mp3.volume(volumen); Serial.printf("Volumen: %d\n", volumen); break;
    case '-': volumen = max(0,  volumen - 3); mp3.volume(volumen); Serial.printf("Volumen: %d\n", volumen); break;
    case 'i': informacion(); break;
    default:  ayuda(); break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Prueba MP3-TF-16P ===");

  Serial2.begin(9600, SERIAL_8N1, PIN_ESP_RX, PIN_ESP_TX);
  delay(1500);   // el modulo tarda en arrancar

  Serial.println("Iniciando modulo...");
  if (!mp3.begin(Serial2, true, true)) {
    Serial.println("Sin respuesta del modulo. Revisa:");
    Serial.println("  1) TX/RX: intercambia PIN_ESP_RX y PIN_ESP_TX");
    Serial.println("  2) microSD en FAT32 con 0001.mp3, 0002.mp3... en la raiz");
    Serial.println("  3) alimentacion estable (mejor 5V) y GND comun");
    Serial.println("Sigo en modo sin confirmacion por si tu clon no responde ACK...");
    mp3.begin(Serial2, false, true);
  } else {
    Serial.println("Modulo detectado.");
  }

  mp3.setTimeOut(500);
  mp3.volume(volumen);
  mp3.EQ(DFPLAYER_EQ_NORMAL);
  mp3.outputDevice(DFPLAYER_DEVICE_SD);
  delay(300);

  informacion();
  Serial.println("Reproduciendo pista 1...");
  mp3.play(1);
  ayuda();
}

void loop() {
  if (Serial.available()) {
    comando(Serial.readStringUntil('\n'));
  }
  if (mp3.available()) {
    detalle(mp3.readType(), mp3.read());
  }
}