import json
import logging
import time
import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

from backend.models import VitalReading, AlertMessage

logger = logging.getLogger("dinopad.rules")

CREW_JSON_PATH = Path(__file__).resolve().parent / "data" / "crew.json"

# Cargar configuración de tripulantes e indicadores
with open(CREW_JSON_PATH, "r", encoding="utf-8") as f:
    _CREW_DATA = json.load(f)

CREW = _CREW_DATA["crew"]
INDICATORS = _CREW_DATA["indicators"]

# Anti-spam: Registro de la última vez que se emitió una alerta
# Clave: (crew_id, indicator_id, level) -> timestamp en segundos
_last_alert_times: Dict[Tuple[str, Optional[str], str], float] = {}
ANTI_SPAM_SECONDS = 30.0


def reset_antispam():
    """Limpia la memoria de anti-spam (útil para pruebas)."""
    global _last_alert_times
    _last_alert_times.clear()


def get_ranges(ind: dict, crew_member: dict) -> dict:
    """Obtiene los rangos de un indicador para un tripulante (usa el propio si existe)."""
    own = crew_member.get("ranges", {}).get(ind["id"], {})
    return {
        "ok": own.get("ok", ind["ok"]),
        "warn": own.get("warn", ind["warn"]),
    }


def evaluate_reading(reading: VitalReading) -> Optional[dict]:
    """
    Evalúa una lectura biométrica con la misma lógica que health.js del frontend.
    Si está fuera de rango y no está en período anti-spam, genera un diccionario de alerta.
    Lecturas con quality 'no_signal' o value null NO generan alerta de rango.
    """
    if reading.quality == "no_signal" or reading.value is None:
        return None

    crew_member = CREW.get(reading.crewId)
    ind = INDICATORS.get(reading.indicatorId)
    if not crew_member or not ind:
        return None

    ranges = get_ranges(ind, crew_member)
    ok_range = ranges["ok"]
    warn_range = ranges["warn"]
    v = reading.value

    # Determinación de estado exactamente igual a health.js
    if ok_range[0] <= v <= ok_range[1]:
        return None  # Estado 'ok', sin alerta

    if warn_range[0] <= v <= warn_range[1]:
        status = "warn"
        level = "warning"
        title = f"{ind['name']} fuera de rango"
    else:
        status = "crit"
        level = "critical"
        title = f"{ind['name']} crítica"

    # Verificación Anti-Spam (mismo tripulante + indicador + nivel en menos de 30s)
    now_sec = time.time()
    cache_key = (reading.crewId, reading.indicatorId, level)
    last_time = _last_alert_times.get(cache_key, 0.0)
    if (now_sec - last_time) < ANTI_SPAM_SECONDS:
        logger.debug("[ANTI-SPAM] Alerta suprimida para %s:%s:%s", reading.crewId, reading.indicatorId, level)
        return None

    _last_alert_times[cache_key] = now_sec

    dir_str = "por debajo" if v < ok_range[0] else "por encima"
    message = f"{v} {ind['unit']}, {dir_str} del rango normal ({ok_range[0]}–{ok_range[1]})."
    action = ind.get("action", "Verificar condición del tripulante y reportar a tierra.")

    alert_dict = {
        "id": str(uuid.uuid4()),
        "timestamp": reading.timestamp,
        "crewId": reading.crewId,
        "indicatorId": reading.indicatorId,
        "level": level,
        "title": title,
        "message": message,
        "action": action,
        "origin": "rule",
        "aiExplanation": None,
    }
    logger.info("[REGLA GENERADA] %s | %s: %s (%s)", reading.crewId, title, message, level)
    return alert_dict


def evaluate_alert_message(msg: AlertMessage) -> Optional[dict]:
    """
    Evalúa mensajes desde dinopad/alertas (SOS o Ping).
    type 'sos'  -> level 'critical', title 'SOS', origin 'button'
    type 'ping' -> level 'info', title 'Ping', origin 'button'
    """
    crew_member = CREW.get(msg.crewId, {})
    crew_name = crew_member.get("name", msg.crewId)
    now_sec = time.time()

    if msg.type == "sos":
        level = "critical"
        title = "SOS"
        cache_key = (msg.crewId, None, level)
        if (now_sec - _last_alert_times.get(cache_key, 0.0)) < ANTI_SPAM_SECONDS:
            logger.debug("[ANTI-SPAM] Alerta SOS repetida suprimida para %s", msg.crewId)
            return None
        _last_alert_times[cache_key] = now_sec

        return {
            "id": str(uuid.uuid4()),
            "timestamp": msg.timestamp,
            "crewId": msg.crewId,
            "indicatorId": None,
            "level": level,
            "title": title,
            "message": f"Señal de emergencia (SOS) activada manualmente por {crew_name}.",
            "action": "Atención médica y de soporte vital inmediata. Contactar al astronauta y activar protocolo de rescate EVA/cabina.",
            "origin": "button",
            "aiExplanation": None,
        }

    elif msg.type == "ping":
        level = "info"
        title = "Ping"
        cache_key = (msg.crewId, None, level)
        if (now_sec - _last_alert_times.get(cache_key, 0.0)) < ANTI_SPAM_SECONDS:
            return None
        _last_alert_times[cache_key] = now_sec

        return {
            "id": str(uuid.uuid4()),
            "timestamp": msg.timestamp,
            "crewId": msg.crewId,
            "indicatorId": None,
            "level": level,
            "title": title,
            "message": f"Ping de enlace recibido desde el Dinopad de {crew_name}.",
            "action": "Conexión confirmada. Ninguna acción requerida.",
            "origin": "button",
            "aiExplanation": None,
        }

    return None

