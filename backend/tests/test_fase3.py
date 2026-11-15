import asyncio
import json
import logging
import sys
import threading
import time
import urllib.request
from pathlib import Path
import websockets
import paho.mqtt.client as mqtt
import uvicorn

# Agregar raíz al path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from backend.config import settings
from backend.simulator.mock_broker import MiniMQTTBroker
import psycopg

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_fase3")

TEST_PORT_MQTT = 18883
TEST_PORT_HTTP = 8088
BASE_URL = f"http://127.0.0.1:{TEST_PORT_HTTP}"
WS_VITALS_URL = f"ws://127.0.0.1:{TEST_PORT_HTTP}/ws/vitals"
WS_ALERTS_URL = f"ws://127.0.0.1:{TEST_PORT_HTTP}/ws/alerts"

TEST_VAL_MARKER = 777.7


def cleanup_db():
    try:
        url = settings.effective_database_url
        if not url:
            return
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM vitals WHERE value = %s;", (TEST_VAL_MARKER,))
                cur.execute("DELETE FROM alerts WHERE title LIKE '%Alerta SOS de Emergencia%';")
                conn.commit()
    except Exception as e:
        logger.warning("Cleanup error: %s", e)


async def async_ws_test():
    # 1. Probar conexión y recepción en /ws/vitals y /ws/alerts
    logger.info("Conectando clientes WebSocket...")
    async with websockets.connect(WS_VITALS_URL) as ws_vitals, \
               websockets.connect(WS_ALERTS_URL) as ws_alerts:

        # 2. Publicar por MQTT desde un publisher simulado
        try:
            pub = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id="test-pub-f3",
                protocol=mqtt.MQTTv311,
            )
        except (AttributeError, TypeError):
            pub = mqtt.Client(client_id="test-pub-f3", protocol=mqtt.MQTTv311)

        pub.connect("127.0.0.1", TEST_PORT_MQTT, 60)
        pub.loop_start()
        time.sleep(0.3)

        now = int(time.time() * 1000)

        # Publicar vital
        vital_msg = {
            "crewId": "comandante",
            "indicatorId": "hr",
            "value": TEST_VAL_MARKER,
            "unit": "lpm",
            "timestamp": now,
            "source": "simulated",
            "quality": "ok",
        }
        pub.publish("dinopad/vitals", json.dumps(vital_msg))

        # Publicar SOS
        alert_msg = {
            "crewId": "comandante",
            "type": "sos",
            "timestamp": now,
        }
        pub.publish("dinopad/alertas", json.dumps(alert_msg))

        # 3. Recibir por WebSocket con timeout
        raw_vital = await asyncio.wait_for(ws_vitals.recv(), timeout=3.0)
        vital_rcv = json.loads(raw_vital)
        logger.info("[WS RECIBIDO /ws/vitals]: %s", vital_rcv)
        assert vital_rcv["crewId"] == "comandante"
        assert vital_rcv["value"] == TEST_VAL_MARKER
        assert vital_rcv["unit"] == "lpm"

        raw_alert = await asyncio.wait_for(ws_alerts.recv(), timeout=3.0)
        alert_rcv = json.loads(raw_alert)
        logger.info("[WS RECIBIDO /ws/alerts]: %s", alert_rcv)
        assert alert_rcv["crewId"] == "comandante"
        assert alert_rcv["level"] == "critical"
        assert "SOS" in alert_rcv["title"]

        pub.loop_stop()
        pub.disconnect()

    logger.info("Clientes WebSocket desconectados limpiamente.")


def test_fase3():
    print("\n" + "=" * 65)
    print("INICIANDO PRUEBA DE FASE 3: API REST + WEBSOCKETS EN TIEMPO REAL")
    print("=" * 65)

    settings.mqtt_host = "127.0.0.1"
    settings.mqtt_port = TEST_PORT_MQTT

    # 1. Iniciar mini broker
    broker = MiniMQTTBroker(host="127.0.0.1", port=TEST_PORT_MQTT)
    t_broker = threading.Thread(target=lambda: asyncio.run(broker.start()), daemon=True)
    t_broker.start()
    time.sleep(0.4)

    # 2. Iniciar servidor FastAPI con Uvicorn en segundo plano
    from backend.main import app
    config = uvicorn.Config(app=app, host="127.0.0.1", port=TEST_PORT_HTTP, log_level="warning")
    server = uvicorn.Server(config)
    t_server = threading.Thread(target=server.run, daemon=True)
    t_server.start()
    time.sleep(1.0)

    try:
        # A) Probar GET /health
        with urllib.request.urlopen(f"{BASE_URL}/health") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            print("\n1. GET /health -> Status 200 OK")
            print("   Respuesta:", data)
            assert data["status"] == "ok"
            assert "db_connected" in data

        # B) Probar GET /api/crew
        with urllib.request.urlopen(f"{BASE_URL}/api/crew") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            print("\n2. GET /api/crew -> Status 200 OK")
            print("   Tripulantes disponibles:", list(data["crew"].keys()))
            assert "comandante" in data["crew"]
            assert "indicators" in data

        # C) Probar GET /api/vitals/latest?crewId=comandante
        with urllib.request.urlopen(f"{BASE_URL}/api/vitals/latest?crewId=comandante") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            print("\n3. GET /api/vitals/latest?crewId=comandante -> Status 200 OK")
            print(f"   Indicadores recuperados: {len(data)}")

        # D) Probar GET /api/vitals/history?crewId=comandante&indicatorId=hr&limit=5
        with urllib.request.urlopen(f"{BASE_URL}/api/vitals/history?crewId=comandante&indicatorId=hr&limit=5") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            print("\n4. GET /api/vitals/history?crewId=comandante&indicatorId=hr&limit=5 -> Status 200 OK")
            print(f"   Puntos de historial recuperados: {len(data)}")

        # E) Probar GET /api/alerts?crewId=comandante&limit=5
        with urllib.request.urlopen(f"{BASE_URL}/api/alerts?crewId=comandante&limit=5") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            print("\n5. GET /api/alerts?crewId=comandante&limit=5 -> Status 200 OK")
            print(f"   Alertas recuperadas: {len(data)}")

        # F) Probar WebSockets en tiempo real (/ws/vitals y /ws/alerts)
        print("\n6. Probando WebSockets (/ws/vitals y /ws/alerts)...")
        asyncio.run(async_ws_test())
        print("   -> Mensajes recibidos en tiempo real por WebSocket con éxito.")

        print("\n" + "=" * 65)
        print(">>> ¡PRUEBA DE FASE 3 COMPLETADA EXITOSAMENTE! <<<")
        print("API REST + WebSockets validados y funcionando de punta a punta.")
        print("=" * 65 + "\n")

    finally:
        cleanup_db()
        server.should_exit = True
        time.sleep(0.5)


if __name__ == "__main__":
    test_fase3()

