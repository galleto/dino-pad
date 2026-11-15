import asyncio
import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Asegurar backend en sys.path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from backend.config import settings
from backend.db import (
    init_db,
    close_db,
    is_db_connected,
    save_vital,
    save_alert,
    save_device_status,
    get_latest_vitals,
    get_vitals_history,
    get_alerts,
)
from backend.models import AssistantRequest, AssistantResponse, VitalReading, AlertMessage, DeviceStatus
from backend.mqtt_client import mqtt_service
from backend.rules import evaluate_reading, evaluate_alert_message
from backend.gemini_service import AssistantGenerationError, explain_alert_background
from backend.assistant_service import generate_assistant_response
from backend.websocket_manager import ws_manager

CREW_JSON_PATH = BACKEND_DIR / "data" / "crew.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("dinopad.main")

_main_loop: Optional[asyncio.AbstractEventLoop] = None
_assistant_request_times: dict[str, list[float]] = {}
_ASSISTANT_RATE_WINDOW_SECONDS = 60
_ASSISTANT_RATE_LIMIT = 10


def _dispatch_ai_if_needed(alert_dict: dict):
    """Programa la explicación de IA en segundo plano sin bloquear el flujo principal."""
    if alert_dict.get("level") in ["critical", "warning"] and _main_loop and _main_loop.is_running():
        asyncio.run_coroutine_threadsafe(explain_alert_background(alert_dict), _main_loop)


def handle_incoming_vital(reading: VitalReading):
    """
    1. Guarda la lectura en TimescaleDB.
    2. La emite en tiempo real por /ws/vitals en el formato exacto del frontend.
    3. Evalúa reglas deterministas de salud (health.js). Si hay alerta, la guarda,
       la emite por /ws/alerts y programa Gemini en segundo plano.
    """
    save_vital(reading)
    ws_manager.broadcast_vital_threadsafe(reading.model_dump())

    alert = evaluate_reading(reading)
    if alert:
        save_alert(alert)
        ws_manager.broadcast_alert_threadsafe(alert)
        _dispatch_ai_if_needed(alert)


def handle_incoming_alert_msg(msg: AlertMessage):
    """
    Procesa mensajes desde dinopad/alertas (SOS o Ping).
    type 'sos' -> level critical, title SOS, origin button.
    type 'ping' -> level info.
    """
    alert = evaluate_alert_message(msg)
    if alert:
        save_alert(alert)
        ws_manager.broadcast_alert_threadsafe(alert)
        _dispatch_ai_if_needed(alert)


def _check_assistant_rate_limit(client_key: str) -> bool:
    now = time.monotonic()
    recent = [stamp for stamp in _assistant_request_times.get(client_key, []) if now - stamp < _ASSISTANT_RATE_WINDOW_SECONDS]
    if len(recent) >= _ASSISTANT_RATE_LIMIT:
        _assistant_request_times[client_key] = recent
        return False
    recent.append(now)
    _assistant_request_times[client_key] = recent
    if len(_assistant_request_times) > 512:
        oldest_key = min(_assistant_request_times, key=lambda key: max(_assistant_request_times[key], default=0))
        _assistant_request_times.pop(oldest_key, None)
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    ws_manager.set_loop(_main_loop)

    logger.info("Iniciando Dinopad Backend...")
    logger.info("Configuracion activa: %s", settings.safe_summary())

    # Inicializar Base de Datos (TimescaleDB)
    db_ok = init_db()
    if db_ok:
        logger.info("[DB] Base de datos TimescaleDB conectada e inicializada.")
    else:
        logger.warning("[DB] TimescaleDB no disponible. Operando en modo degradado en memoria.")

    # Conectar observadores de MQTT
    mqtt_service.on_vitals(handle_incoming_vital)
    mqtt_service.on_alert(handle_incoming_alert_msg)
    mqtt_service.on_status(save_device_status)

    # Iniciar cliente MQTT
    mqtt_service.start()
    yield

    # Cierre
    logger.info("Cerrando Dinopad Backend...")
    mqtt_service.stop()
    close_db()


app = FastAPI(
    title="Dinopad Space Health API",
    description="Backend de monitoreo biometrico y alertas para Dinopad (NASA Space Apps)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS abierto para desarrollo local de React + Vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Salud"])
def health_check():
    """Estado del backend, conexión a base de datos y broker MQTT."""
    return {
        "status": "ok",
        "service": "dinopad-backend",
        "db_connected": is_db_connected(),
        "mqtt_connected": mqtt_service._connected,
        "mqtt_broker": f"{settings.mqtt_host}:{settings.mqtt_port}",
        "ws_vitals_clients": len(ws_manager.vitals_connections),
        "ws_alerts_clients": len(ws_manager.alerts_connections),
    }


@app.get("/api/crew", tags=["Tripulación"])
def get_crew():
    """Sirve la información oficial de tripulantes, baselines, rangos y escenarios."""
    try:
        with open(CREW_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Error al leer crew.json: %s", e)
        raise HTTPException(status_code=500, detail="Error al cargar datos de tripulantes")


@app.get("/api/vitals/latest", tags=["Vitals"])
def api_latest_vitals(crewId: str = Query(..., description="ID del tripulante: comandante, botanico, ingeniero")):
    """Devuelve la última lectura de cada indicador para el tripulante indicado."""
    if crewId not in ["comandante", "botanico", "ingeniero"]:
        raise HTTPException(status_code=400, detail="crewId no válido (use: comandante, botanico o ingeniero)")
    return get_latest_vitals(crewId)


@app.get("/api/vitals/history", tags=["Vitals"])
def api_vitals_history(
    crewId: str = Query(..., description="ID del tripulante"),
    indicatorId: str = Query(..., description="ID del indicador (hr, spo2, temp, etc.)"),
    limit: int = Query(100, ge=1, le=500, description="Cantidad máxima de registros"),
):
    """Devuelve el historial en orden cronológico: [{'timestamp': ms, 'value': n, 'quality': 'ok'}]."""
    return get_vitals_history(crewId, indicatorId, limit)


@app.get("/api/alerts", tags=["Alertas"])
def api_alerts(
    crewId: Optional[str] = Query(None, description="Filtrar por ID de tripulante"),
    limit: int = Query(50, ge=1, le=200, description="Cantidad máxima de alertas"),
):
    """Devuelve la lista de alertas recientes con su estado, título, mensaje, acción y explicación de IA."""
    return get_alerts(crewId, limit)


@app.post("/api/assistant", response_model=AssistantResponse, tags=["Asistente"])
async def api_educational_assistant(payload: AssistantRequest, request: Request):
    """Genera una explicación educativa contextual y usa Backboard si está configurado."""
    client_key = request.client.host if request.client else "unknown"
    if not _check_assistant_rate_limit(client_key):
        raise HTTPException(
            status_code=429,
            detail="Límite del asistente alcanzado. Inténtalo de nuevo en un minuto.",
            headers={"Retry-After": str(_ASSISTANT_RATE_WINDOW_SECONDS)},
        )
    try:
        return await generate_assistant_response(payload)
    except AssistantGenerationError as error:
        status_code = 503 if "no está configurada" in str(error) else 502
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    except asyncio.TimeoutError as error:
        raise HTTPException(status_code=504, detail="El asistente tardó demasiado en responder.") from error


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Dinopad Space Health API v1.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.websocket("/ws/vitals")
async def ws_vitals_endpoint(websocket: WebSocket):
    """Emite cada lectura recibida por MQTT en el formato exacto del frontend."""
    await ws_manager.connect_vitals(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_vitals(websocket)
    except Exception:
        ws_manager.disconnect_vitals(websocket)


@app.websocket("/ws/alerts")
async def ws_alerts_endpoint(websocket: WebSocket):
    """Emite cada nueva alerta generada en tiempo real (inicial y enriquecida con IA)."""
    await ws_manager.connect_alerts(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_alerts(websocket)
    except Exception:
        ws_manager.disconnect_alerts(websocket)


def run():
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run()
