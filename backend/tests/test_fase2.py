import logging
import sys
import time
import uuid
from pathlib import Path

# Agregar raíz al path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from backend.db import (
    init_db,
    close_db,
    is_db_connected,
    save_vital,
    save_alert,
    update_alert_ai,
    save_device_status,
    get_latest_vitals,
    get_vitals_history,
    get_alerts,
    get_devices,
)
from backend.models import VitalReading, DeviceStatus
import psycopg
from backend.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_fase2")

# Marcadores únicos para este test
TEST_CREW_ID = "comandante"
TEST_DEVICE_ID = "dinopad-test-fase2"
TEST_ALERT_ID = str(uuid.uuid4())
TEST_SPECIAL_VAL_1 = 999.1
TEST_SPECIAL_VAL_2 = 999.2
TEST_SPECIAL_VAL_3 = 999.3


def cleanup_test_rows():
    """Limpia estrictamente las filas insertadas con los marcadores de este test."""
    try:
        url = settings.effective_database_url
        if not url:
            return
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM alerts WHERE id = %s;", (TEST_ALERT_ID,))
                cur.execute("DELETE FROM device_status WHERE device_id = %s;", (TEST_DEVICE_ID,))
                cur.execute("DELETE FROM vitals WHERE crew_id = %s AND value IN (%s, %s, %s);",
                            (TEST_CREW_ID, TEST_SPECIAL_VAL_1, TEST_SPECIAL_VAL_2, TEST_SPECIAL_VAL_3))
                conn.commit()
                logger.info("[CLEANUP] Filas de prueba eliminadas de TimescaleDB.")
    except Exception as e:
        logger.warning("[CLEANUP ERROR] No se pudieron limpiar las filas de prueba: %s", e)


def test_fase2():
    print("\n" + "=" * 60)
    print("INICIANDO PRUEBA DE FASE 2: BASE DE DATOS Y CONSULTAS (AUTOLIMPIANTE)")
    print("=" * 60)

    try:
        # 1. Inicializar BD
        db_ok = init_db()
        print(f"1. Base de datos inicializada: {db_ok} (Conectada a TimescaleDB: {is_db_connected()})")

        now = int(time.time() * 1000)

        # 2. Guardar lecturas de vitals con valores marcadores únicos
        reading_hr = VitalReading(
            crewId=TEST_CREW_ID,
            indicatorId="hr",
            value=TEST_SPECIAL_VAL_1,
            unit="lpm",
            timestamp=now - 2000,
            source="simulated",
            quality="ok",
        )
        reading_spo2 = VitalReading(
            crewId=TEST_CREW_ID,
            indicatorId="spo2",
            value=TEST_SPECIAL_VAL_2,
            unit="%",
            timestamp=now - 1000,
            source="simulated",
            quality="ok",
        )
        reading_hr_new = VitalReading(
            crewId=TEST_CREW_ID,
            indicatorId="hr",
            value=TEST_SPECIAL_VAL_3,
            unit="lpm",
            timestamp=now,
            source="simulated",
            quality="ok",
        )

        save_vital(reading_hr)
        save_vital(reading_spo2)
        save_vital(reading_hr_new)
        print("2. Guardadas 3 lecturas de vitals marcadas para la prueba.")

        # 3. Guardar estado de dispositivo marcado
        status = DeviceStatus(
            deviceId=TEST_DEVICE_ID,
            crewId=TEST_CREW_ID,
            status="online",
            batteryPct=92,
            rssi=-58,
            timestamp=now,
        )
        save_device_status(status)
        print("3. Guardado estado de dispositivo marcado:", TEST_DEVICE_ID)

        # 4. Guardar alerta marcada y actualizar explicacion de IA
        alert_data = {
            "id": TEST_ALERT_ID,
            "timestamp": now,
            "crewId": TEST_CREW_ID,
            "indicatorId": "spo2",
            "level": "critical",
            "title": "Oxigenación de Prueba SpO2",
            "message": "Mensaje de prueba fase 2.",
            "action": "Accion de prueba fase 2.",
            "origin": "rule",
            "aiExplanation": None,
        }
        save_alert(alert_data)
        print("4. Guardada alerta marcada de prueba (id:", TEST_ALERT_ID, ")")

        update_alert_ai(TEST_ALERT_ID, "Explicación IA de prueba.")
        print("5. Actualizada explicacion de IA para la alerta.")

        # 5. Probar consultas:
        latest = get_latest_vitals(TEST_CREW_ID)
        assert "hr" in latest, "Falta indicador 'hr' en latest vitals"
        assert latest["hr"]["value"] == TEST_SPECIAL_VAL_3, f"Se esperaba último hr={TEST_SPECIAL_VAL_3}"

        history = get_vitals_history(TEST_CREW_ID, "hr", limit=10)
        assert any(h["value"] == TEST_SPECIAL_VAL_3 for h in history), "No se encontró lectura hr marcada en historial"

        alerts = get_alerts(TEST_CREW_ID, limit=5)
        found_alert = next((a for a in alerts if a["id"] == TEST_ALERT_ID), None)
        assert found_alert is not None, "No se encontro la alerta creada"
        assert found_alert["aiExplanation"] == "Explicación IA de prueba.", "La explicacion de IA no coincide"

        devices = get_devices()
        found_dev = next((d for d in devices if d["deviceId"] == TEST_DEVICE_ID), None)
        assert found_dev is not None, "No se encontro el dispositivo marcado"

        print("6. Todas las consultas validadas correctamente.")

    finally:
        # Autolimpieza obligatoria al terminar el test
        cleanup_test_rows()
        close_db()

    print("\n" + "=" * 60)
    print(">>> ¡PRUEBA DE FASE 2 COMPLETADA Y BASE LIMPIADA! <<<")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    test_fase2()
