import json
import math
import os
import random
import sys
import time
from pathlib import Path
import paho.mqtt.client as mqtt

# Añadir raíz de backend al path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from backend.config import settings

CREW_JSON_PATH = BACKEND_DIR / "data" / "crew.json"

TICK_MS = 1.0  # Intervalo de 1 segundo
DROPOUT_CHANCE = 0.01  # Probabilidad de 'no_signal'

# Soporte para teclado interactivo en Windows
try:
    import msvcrt
    HAS_MSVCRT = True
except ImportError:
    HAS_MSVCRT = False


def noise(amp: float) -> float:
    return (random.random() - 0.5) * 2 * amp


def circadian(indicator_id: str, t: float) -> float:
    if indicator_id == "temp":
        return math.sin(t / 90.0) * 0.15
    if indicator_id == "hr":
        return math.sin(t / 60.0) * 2.0
    return 0.0


def clamp(indicator_id: str, v: float) -> float:
    if indicator_id == "spo2":
        return min(100.0, v)
    if indicator_id == "mood":
        return max(1.0, min(10.0, v))
    if indicator_id == "sleep":
        return max(0.0, min(14.0, v))
    return v


class DinopadSimulator:
    def __init__(self):
        with open(CREW_JSON_PATH, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        self.crew = self.data["crew"]
        self.indicators = self.data["indicators"]
        self.scenarios = self.data["scenarios"]
        self.scenario_id = "normal"
        self.t = 0

        # Estado interno de simulación por tripulante e indicador
        self.state = {}
        for c_id, c in self.crew.items():
            self.state[c_id] = {}
            for i_id, ind in self.indicators.items():
                start = c["baseline"].get(i_id, 0) + c.get("bias", {}).get(i_id, 0)
                self.state[c_id][i_id] = {"value": float(start), "lastEmit": 0}

        # Cliente MQTT con protocolo MQTTv311 estándar
        try:
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id="dinopad-simulator",
                protocol=mqtt.MQTTv311,
            )
        except (AttributeError, TypeError):
            self.client = mqtt.Client(client_id="dinopad-simulator", protocol=mqtt.MQTTv311)

        if settings.mqtt_user and settings.mqtt_password:
            self.client.username_pw_set(settings.mqtt_user, settings.mqtt_password)
        if settings.mqtt_tls:
            self.client.tls_set()

        self.battery = 98

    def connect(self):
        print(f"[SIMULADOR] Conectando al broker MQTT en {settings.mqtt_host}:{settings.mqtt_port}...")
        try:
            self.client.connect(settings.mqtt_host, settings.mqtt_port, 60)
            self.client.loop_start()
            print("[SIMULADOR] Conectado exitosamente al broker.")
        except Exception as e:
            print(f"[SIMULADOR ERROR] No se pudo conectar al broker MQTT: {e}")
            print("Asegúrate de que el broker MQTT esté corriendo o edita MQTT_HOST en tu .env.")
            sys.exit(1)

    def target(self, c_id: str, i_id: str) -> float:
        c = self.crew[c_id]
        ind = self.indicators[i_id]
        scenario = self.scenarios.get(self.scenario_id, {"effects": {}})
        effects = scenario.get("effects", {}).get(i_id, 0)
        base = c["baseline"].get(i_id, 0) + c.get("bias", {}).get(i_id, 0)
        return float(base + effects + circadian(i_id, self.t))

    def tick(self):
        self.t += 1
        now_ms = int(time.time() * 1000)

        for c_id, c in self.crew.items():
            for i_id, ind in self.indicators.items():
                s = self.state[c_id][i_id]
                inertia = ind.get("inertia", 0.2)
                amp_noise = ind.get("noise", 1.0)
                tgt = self.target(c_id, i_id)

                s["value"] += (tgt - s["value"]) * inertia * 0.2 + noise(amp_noise * 0.3)

                cadence = ind.get("cadenceMs", 1000)
                if now_ms - s["lastEmit"] < cadence:
                    continue

                s["lastEmit"] = now_ms
                lost = random.random() < DROPOUT_CHANCE
                decimals = ind.get("decimals", 0)

                raw_val = round(s["value"] + noise(amp_noise), decimals) if decimals > 0 else round(s["value"] + noise(amp_noise))
                clamped_val = clamp(i_id, raw_val)

                reading = {
                    "crewId": c_id,
                    "indicatorId": i_id,
                    "value": None if lost else clamped_val,
                    "unit": ind["unit"],
                    "timestamp": now_ms,
                    "source": "simulated",
                    "quality": "no_signal" if lost else "ok",
                }

                self.client.publish("dinopad/vitals", json.dumps(reading))

        # Enviar estado de batería y dispositivo periódicamente
        if self.t % 10 == 0:
            self.battery = max(10, self.battery - 1)
            status = {
                "deviceId": "dinopad-01",
                "crewId": "comandante",
                "status": "online",
                "batteryPct": self.battery,
                "rssi": -55 - random.randint(0, 10),
                "timestamp": now_ms,
            }
            self.client.publish("dinopad/estado", json.dumps(status))

    def send_sos(self):
        now_ms = int(time.time() * 1000)
        payload = {"crewId": "comandante", "type": "sos", "timestamp": now_ms}
        self.client.publish("dinopad/alertas", json.dumps(payload))
        print(f"\n>>> [SIMULADOR] ¡BOTON SOS ENVIADO! -> {payload}")

    def send_ping(self):
        now_ms = int(time.time() * 1000)
        payload = {"crewId": "comandante", "type": "ping", "timestamp": now_ms}
        self.client.publish("dinopad/alertas", json.dumps(payload))
        print(f"\n>>> [SIMULADOR] PING ENVIADO -> {payload}")

    def force_abnormal(self):
        now_ms = int(time.time() * 1000)
        # Lectura crítica: SpO2 al 84% para el comandante
        payload = {
            "crewId": "comandante",
            "indicatorId": "spo2",
            "value": 84.0,
            "unit": "%",
            "timestamp": now_ms,
            "source": "simulated",
            "quality": "ok",
        }
        self.client.publish("dinopad/vitals", json.dumps(payload))
        print(f"\n>>> [SIMULADOR] ¡LECTURA ANORMAL FORZADA (SpO2=84%)! -> {payload}")

    def run(self):
        self.connect()
        print("\n" + "=" * 60)
        print("SIMULADOR DINOPAD ACTIVO")
        print("Publicando lecturas cada 1 s en dinopad/vitals...")
        print("Comandos disponibles en teclado:")
        print("  [s] -> Enviar alerta SOS (dinopad/alertas)")
        print("  [p] -> Enviar Ping de prueba (dinopad/alertas)")
        print("  [a] -> Forzar lectura anormal crítica SpO2=84% (dinopad/vitals)")
        print("  [q] -> Salir del simulador")
        print("=" * 60 + "\n")

        try:
            while True:
                # Comprobar teclas presionadas en Windows
                if HAS_MSVCRT and msvcrt.kbhit():
                    ch = msvcrt.getch().decode("utf-8", errors="ignore").lower()
                    if ch == "s":
                        self.send_sos()
                    elif ch == "p":
                        self.send_ping()
                    elif ch == "a":
                        self.force_abnormal()
                    elif ch == "q":
                        print("\n[SIMULADOR] Deteniendo...")
                        break

                self.tick()
                time.sleep(TICK_MS)
        except KeyboardInterrupt:
            print("\n[SIMULADOR] Interrumpido por usuario.")
        finally:
            self.client.loop_stop()
            self.client.disconnect()


if __name__ == "__main__":
    sim = DinopadSimulator()
    sim.run()
