import asyncio
import json
import logging
import sys
import threading
import time
from pathlib import Path

# Agregar raíz al path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from backend.config import settings
from backend.models import VitalReading, AlertMessage, DeviceStatus
from backend.mqtt_client import DinopadMQTTClient, TOPIC_VITALS, TOPIC_ALERTS, TOPIC_STATUS
from backend.simulator.mock_broker import MiniMQTTBroker
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_fase1")


def run_broker(broker):
    asyncio.run(broker.start())


def test_fase1():
    test_port = 18883
    settings.mqtt_host = "127.0.0.1"
    settings.mqtt_port = test_port

    # 1. Iniciar broker
    broker = MiniMQTTBroker(host="127.0.0.1", port=test_port)
    broker_thread = threading.Thread(target=run_broker, args=(broker,), daemon=True)
    broker_thread.start()
    time.sleep(0.4)

    # 2. Iniciar cliente del backend
    received_vitals = []
    received_alerts = []
    received_status = []

    client_backend = DinopadMQTTClient()
    client_backend.on_vitals(lambda r: received_vitals.append(r))
    client_backend.on_alert(lambda a: received_alerts.append(a))
    client_backend.on_status(lambda s: received_status.append(s))
    client_backend.start()

    time.sleep(0.5)

    # 3. Iniciar publisher
    try:
        pub = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="test-publisher",
            protocol=mqtt.MQTTv311,
        )
    except (AttributeError, TypeError):
        pub = mqtt.Client(client_id="test-publisher", protocol=mqtt.MQTTv311)

    pub.connect("127.0.0.1", test_port, 60)
    pub.loop_start()
    time.sleep(0.3)

    now = int(time.time() * 1000)

    # A) Lectura válida de vitals
    vitals_payload = {
        "crewId": "comandante",
        "indicatorId": "hr",
        "value": 72.0,
        "unit": "lpm",
        "timestamp": now,
        "source": "simulated",
        "quality": "ok",
    }
    pub.publish(TOPIC_VITALS, json.dumps(vitals_payload))

    # B) Alerta válida SOS
    alert_payload = {
        "crewId": "comandante",
        "type": "sos",
        "timestamp": now,
    }
    pub.publish(TOPIC_ALERTS, json.dumps(alert_payload))

    # C) Estado de dispositivo válido
    status_payload = {
        "deviceId": "dinopad-01",
        "crewId": "comandante",
        "status": "online",
        "batteryPct": 88,
        "rssi": -62,
        "timestamp": now,
    }
    pub.publish(TOPIC_STATUS, json.dumps(status_payload))

    # D) Mensajes inválidos (deben loguearse como warning sin tirar el backend)
    pub.publish(TOPIC_VITALS, json.dumps({"crewId": "alien", "value": "invalido"}))
    pub.publish(TOPIC_ALERTS, "no_es_json_valido")

    time.sleep(1.0)

    # 4. Verificaciones
    assert len(received_vitals) == 1, f"Se esperaba 1 lectura, recibidas: {len(received_vitals)}"
    v = received_vitals[0]
    assert v.crewId == "comandante"
    assert v.indicatorId == "hr"
    assert v.value == 72.0
    assert v.unit == "lpm"

    assert len(received_alerts) == 1, f"Se esperaba 1 alerta, recibidas: {len(received_alerts)}"
    a = received_alerts[0]
    assert a.crewId == "comandante"
    assert a.type == "sos"

    assert len(received_status) == 1, f"Se esperaba 1 estado, recibidos: {len(received_status)}"
    s = received_status[0]
    assert s.deviceId == "dinopad-01"
    assert s.batteryPct == 88

    pub.loop_stop()
    pub.disconnect()
    client_backend.stop()

    print("\n" + "=" * 55)
    print(">>> PRUEBA FASE 1 COMPLETADA EXITOSAMENTE <<<")
    print(f"1. Vitals recibidos ({v.crewId}): {v.indicatorId}={v.value} {v.unit}")
    print(f"2. Alerta recibida ({a.crewId}): tipo={a.type.upper()}")
    print(f"3. Estado recibido ({s.deviceId}): bateria={s.batteryPct}%, rssi={s.rssi} dBm")
    print("4. Mensajes corruptos e invalidos capturados y descartados sin caidas.")
    print("=" * 55 + "\n")


if __name__ == "__main__":
    test_fase1()
