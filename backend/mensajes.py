"""Mensajes de texto entre la base (web) y el DINO PAD, en los dos sentidos.

Subida (placa -> base): la placa manda {"tema": "dinopad/mensajes"} al elegir un mensaje en MENS.
  Se guarda, se emite por /ws/device ({"type": "mensaje"}) y se crea una alerta informativa
  (o de atención si pide ayuda) para que aparezca en Alertas.
Bajada (base -> placa): la web hace POST /api/device/message. Queda pendiente y viaja en la
  respuesta de la siguiente ingesta de la placa (cada ~3 s). La placa avisa con dinopad/acuse:
  "mostrado" (salió en pantalla) y "leido" (la persona lo cerró con un botón).
LoRa: dinopad/lora actualiza el estado del envío por radio del último mensaje de la placa.

Se guarda en memoria (últimos 200): un reinicio del servidor borra el historial.
"""
import re
import threading
import time
import unicodedata
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.models import CrewId

MAX_TEXTO = 60          # la pantalla de la placa muestra 3 líneas de ~26 caracteres
REENVIO_S = 12          # si no llega "mostrado", se vuelve a mandar
PAUSA_BAJADA_S = 1.5    # mínimo entre mensajes de la base al mismo tripulante


class MensajeSubida(BaseModel):
    crewId: CrewId
    deviceId: str
    text: str = Field(max_length=120)
    timestamp: int
    lora: Optional[str] = None


class AcuseMensaje(BaseModel):
    crewId: CrewId
    id: str = Field(max_length=40)
    estado: Literal["mostrado", "leido"]
    timestamp: int


class EstadoLora(BaseModel):
    crewId: CrewId
    deviceId: str
    estado: str = Field(max_length=40)
    timestamp: int


class MensajeBajada(BaseModel):
    crewId: CrewId
    texto: str = Field(min_length=1, max_length=200)
    de: str = Field(default="Base", max_length=24)


_lock = threading.Lock()
_mensajes: list = []           # más reciente al final
_ultima_bajada: dict = {}      # crewId -> time.time()


def texto_pantalla(texto: str, maximo: int = MAX_TEXTO) -> str:
    """ASCII imprimible para la fuente 5x7 de la placa: sin acentos, sin comillas ni barras."""
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r'["\\\x00-\x1f\x7f]', "", t)
    return re.sub(r"\s+", " ", t).strip()[:maximo]


def _guardar(m: dict) -> dict:
    with _lock:
        _mensajes.append(m)
        del _mensajes[:-200]
    return m


def historial(crew_id: Optional[str] = None, limite: int = 50) -> list:
    with _lock:
        lista = [m for m in _mensajes if not crew_id or m["crewId"] == crew_id]
    return lista[-limite:]


def registrar_subida(msg: MensajeSubida) -> dict:
    return _guardar({
        "id": uuid.uuid4().hex[:12], "crewId": msg.crewId, "deviceId": msg.deviceId,
        "direccion": "subida", "texto": texto_pantalla(msg.text, 120), "timestamp": msg.timestamp,
        "estado": "recibido", "lora": msg.lora, "de": None,
    })


def alerta_de_subida(m: dict, nombre: str) -> dict:
    """Alerta para la lista de Alertas (no contiene 'sos': la web no la confunde con un SOS)."""
    pide_ayuda = bool(re.search(r"ayuda|medic", m["texto"], re.I))
    return {
        "id": str(uuid.uuid4()), "timestamp": m["timestamp"], "crewId": m["crewId"], "indicatorId": None,
        "level": "warning" if pide_ayuda else "info",
        "title": f"Mensaje de {nombre}: {m['texto']}",
        "message": f"Enviado desde el DINO PAD ({m['deviceId']})" + (f"; por LoRa: {m['lora']}." if m.get("lora") else "."),
        "action": "Responder desde la pestaña DINO PAD > Mensajes.",
        "origin": "button", "aiExplanation": None,
    }


def actualizar_lora(est: EstadoLora) -> Optional[dict]:
    with _lock:
        for m in reversed(_mensajes):
            if m["direccion"] == "subida" and m["crewId"] == est.crewId:
                m["lora"] = est.estado
                return dict(m)
    return None


def crear_bajada(req: MensajeBajada) -> dict:
    texto = texto_pantalla(req.texto)
    if not texto:
        raise ValueError("El mensaje queda vacío sin acentos ni símbolos")
    ahora = time.time()
    with _lock:
        if ahora - _ultima_bajada.get(req.crewId, 0) < PAUSA_BAJADA_S:
            raise RuntimeError("Espera un momento entre mensajes")
        _ultima_bajada[req.crewId] = ahora
    return _guardar({
        "id": uuid.uuid4().hex[:12], "crewId": req.crewId, "deviceId": None, "direccion": "bajada",
        "texto": texto, "timestamp": int(ahora * 1000), "estado": "pendiente", "lora": None,
        "de": texto_pantalla(req.de, 24) or "Base", "_enviado": 0.0,
    })


def pendientes_para(crew_ids: set, maximo: int = 2) -> list:
    """Mensajes de la base que todavía no salieron en la pantalla (para la respuesta de ingesta)."""
    ahora = time.time()
    salida = []
    with _lock:
        for m in _mensajes:
            if m["direccion"] != "bajada" or m["crewId"] not in crew_ids or m["estado"] not in ("pendiente", "enviado"):
                continue
            if m["estado"] == "enviado" and ahora - m.get("_enviado", 0) < REENVIO_S:
                continue
            m["estado"], m["_enviado"] = "enviado", ahora
            salida.append({"id": m["id"], "texto": m["texto"], "de": m["de"]})
            if len(salida) >= maximo:
                break
    return salida


def registrar_acuse(ac: AcuseMensaje) -> Optional[dict]:
    orden = {"pendiente": 0, "enviado": 1, "mostrado": 2, "leido": 3}
    with _lock:
        for m in _mensajes:
            if m["id"] == ac.id and m["direccion"] == "bajada":
                if orden[ac.estado] > orden.get(m["estado"], 0):
                    m["estado"] = ac.estado
                return dict(m)
    return None


def publico(m: dict) -> dict:
    """Sin campos internos (los que empiezan con _)."""
    return {k: v for k, v in m.items() if not k.startswith("_")}
