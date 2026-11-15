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
import psycopg

# Agregar raíz al path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from backend.config import settings
from backend.simulator.mock_broker import MiniMQTTBroker
from backend.rules import reset_antispam
from backend.gemini_service import set_mock_gemini

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_fase4")

TEST_PORT_MQTT = 18884
TEST_PORT_HTTP = 8089
BASE_URL = f"http://127.0.0.1:{TEST_PORT_HTTP}"
WS_ALERTS_URL = f"ws://127.0.0.1:{TEST_PORT_HTTP}/ws/alerts"

TEST_MARKER_VAL = 83.33  # Valor único para identificar y limpiar lecturas de prueba


def cleanup_test_data():
    """Elimina las filas generadas durante la prueba de Fase 4."""
    try:
        url = settings.effective_database_url
        if not url:
            return
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM vitals WHERE value = %s;", (TEST_MARKER_VAL,))
                cur.execute("DELETE FROM alerts WHERE title LIKE '%Oxigenación (SpO₂)%' OR title = 'SOS' OR title = 'Ping';")
                conn.commit()
                logger.info("[CLEANUP] Datos de prueba de Fase 4 eliminados de TimescaleDB.")
    except Exception as e:
        logger.warning("Error en cleanup_test_data: %s", e)


async def run_fase4_flow():
    # 1. Configurar Mock de Gemini para no consumir cuota real
    mock_calls = []

    def fake_gemini(prompt: str) -> str:
        mock_calls.append(prompt)
        return "Respuesta simulada de IA: Hipoxia detectada en cabina. Incrementar flujo de O2. Información de soporte, no diagnóstico clínico."

    set_mock_gemini(fake_gemini)
    reset_antispam()

    # 2. Conectar cliente WebSocket para escuchar alertas
    async with websockets.connect(WS_ALERTS_URL) as ws_alerts:
        logger.info("[TEST] Conectado a /ws/alerts")

        # 3. Iniciar publisher MQTT
        try:
            pub = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id="test-pub-f4",
                protocol=mqtt.MQTTv311,
            )
        except (AttributeError, TypeError):
            pub = mqtt.Client(client_id="test-pub-f4", protocol=mqtt.MQTTv311)

        pub.connect("127.0.0.1", TEST_PORT_MQTT, 60)
        pub.loop_start()
        time.sleep(0.3)

        now = int(time.time() * 1000)

        # CASO A: Lectura normal (SpO2 = 98%) -> NO debe generar alerta
        pub.publish("dinopad/vitals", json.dumps({
            "crewId": "comandante", "indicatorId": "spo2", "value": 98.0,
            "unit": "%", "timestamp": now, "source": "simulated", "quality": "ok"
        }))
        time.sleep(0.4)
        assert len(mock_calls) == 0, "Una lectura normal no debe disparar Gemini"

        # CASO B: Lectura sin señal (quality = 'no_signal') -> NO debe generar alerta
        pub.publish("dinopad/vitals", json.dumps({
            "crewId": "comandante", "indicatorId": "spo2", "value": None,
            "unit": "%", "timestamp": now, "source": "simulated", "quality": "no_signal"
        }))
        time.sleep(0.4)
        assert len(mock_calls) == 0, "Lectura no_signal no debe disparar alertas"

        # CASO C: Lectura anormal crítica (SpO2 = 83.33%) -> Genera alerta crítica
        pub.publish("dinopad/vitals", json.dumps({
            "crewId": "comandante", "indicatorId": "spo2", "value": TEST_MARKER_VAL,
            "unit": "%", "timestamp": now, "source": "simulated", "quality": "ok"
        }))

        # Recibe primer mensaje WebSocket (alerta inmediata sin IA)
        msg1_raw = await asyncio.wait_for(ws_alerts.recv(), timeout=4.0)
        msg1 = json.loads(msg1_raw)
        logger.info("[WS 1/2 Alerta Inmediata]: %s - %s", msg1.get("title"), msg1.get("message"))
        assert msg1["level"] == "critical"
        assert "SpO₂" in msg1["title"]
        assert msg1["aiExplanation"] is None, "El primer mensaje inmediato no debe esperar a Gemini"

        # Recibe segundo mensaje WebSocket (misma alerta enriquecida con IA)
        msg2_raw = await asyncio.wait_for(ws_alerts.recv(), timeout=4.0)
        msg2 = json.loads(msg2_raw)
        logger.info("[WS 2/2 Alerta Enriquecida con IA]: %s", msg2.get("aiExplanation"))
        assert msg2["id"] == msg1["id"], "La alerta enriquecida debe conservar el mismo UUID"
        assert msg2["aiExplanation"] is not None
        assert "Hipoxia detectada" in msg2["aiExplanation"]
        assert len(mock_calls) == 1

        # CASO D: Anti-Spam -> Segunda lectura anormal idéntica en <30s debe ser suprimida
        pub.publish("dinopad/vitals", json.dumps({
            "crewId": "comandante", "indicatorId": "spo2", "value": TEST_MARKER_VAL,
            "unit": "%", "timestamp": now + 1000, "source": "simulated", "quality": "ok"
        }))
        time.sleep(0.5)
        # Verificamos que no haya segundo llamado a Gemini
        assert len(mock_calls) == 1, "El anti-spam debió suprimir la alerta duplicada"

        # CASO E: Mensaje SOS desde dinopad/alertas
        pub.publish("dinopad/alertas", json.dumps({
            "crewId": "botanico", "type": "sos", "timestamp": now + 2000
        }))

        msg_sos_1 = json.loads(await asyncio.wait_for(ws_alerts.recv(), timeout=4.0))
        assert msg_sos_1["level"] == "critical"
        assert msg_sos_1["title"] == "SOS"
        assert msg_sos_1["origin"] == "button"

        msg_sos_2 = json.loads(await asyncio.wait_for(ws_alerts.recv(), timeout=4.0))
        assert msg_sos_2["id"] == msg_sos_1["id"]
        assert msg_sos_2["aiExplanation"] is not None
        assert len(mock_calls) == 2

        # CASO F: Mensaje Ping -> Alerta info que NUNCA llama a Gemini
        pub.publish("dinopad/alertas", json.dumps({
            "crewId": "ingeniero", "type": "ping", "timestamp": now + 3000
        }))
        msg_ping = json.loads(await asyncio.wait_for(ws_alerts.recv(), timeout=4.0))
        assert msg_ping["level"] == "info"
        assert msg_ping["title"] == "Ping"
        time.sleep(0.5)
        assert len(mock_calls) == 2, "El ping no debe llamar a Gemini"

        pub.loop_stop()
        pub.disconnect()

    # 4. Probar consulta REST /api/alerts para verificar que devuelve la explicación persistida
    with urllib.request.urlopen(f"{BASE_URL}/api/alerts?crewId=comandante&limit=5") as resp:
        alerts = json.loads(resp.read().decode())
        found = next((a for a in alerts if a["id"] == msg1["id"]), None)
        assert found is not None, "La alerta debe estar disponible en GET /api/alerts"
        assert found["aiExplanation"] is not None
        logger.info("[REST /api/alerts]: Alerta recuperada exitosamente con IA:\n%s", found["aiExplanation"])


def test_fase4():
    print("\n" + "=" * 65)
    print("INICIANDO PRUEBA DE FASE 4: REGLAS DETERMINISTAS + GEMINI")
    print("=" * 65)

    settings.mqtt_host = "127.0.0.1"
    settings.mqtt_port = TEST_PORT_MQTT

    # 1. Mini broker
    broker = MiniMQTTBroker(host="127.0.0.1", port=TEST_PORT_MQTT)
    t_broker = threading.Thread(target=lambda: asyncio.run(broker.start()), daemon=True)
    t_broker.start()
    time.sleep(0.4)

    # 2. Servidor Uvicorn
    from backend.main import app
    config = uvicorn.Config(app=app, host="127.0.0.1", port=TEST_PORT_HTTP, log_level="warning")
    server = uvicorn.Server(config)
    t_server = threading.Thread(target=server.run, daemon=True)
    t_server.start()
    time.sleep(1.0)

    try:
        asyncio.run(run_fase4_flow())
        print("\n" + "=" * 65)
        print(">>> ¡PRUEBA DE FASE 4 COMPLETADA EXITOSAMENTE! <<<")
        print("1. Reglas deterministas conformes a health.js probadas.")
        print("2. Anti-spam de 30s verificado.")
        print("3. Integración en dos pasos (inmediata + IA en background) verificada.")
        print("4. Persistencia en TimescaleDB y recuperación en GET /api/alerts verificada.")
        print("=" * 65 + "\n")
    finally:
        cleanup_test_data()
        server.should_exit = True
        time.sleep(0.5)


if __name__ == "__main__":
    test_fase4()

