import asyncio
import json
import logging
import time
from typing import Dict, Optional

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import ValidationError

from backend.config import settings
from backend.db import get_latest_vitals, update_alert_ai
from backend.models import GeneratedAssistantResponse
from backend.websocket_manager import ws_manager

logger = logging.getLogger("dinopad.gemini")

# Rate limit de Gemini: máximo 1 llamada por tripulante cada 30 segundos
_last_gemini_call: Dict[str, float] = {}
GEMINI_COOLDOWN_SECONDS = 30.0


class AssistantGenerationError(RuntimeError):
    pass


def parse_assistant_response(raw: str) -> GeneratedAssistantResponse:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise AssistantGenerationError("Gemini devolvió JSON inválido.") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("answer"), str) or not payload["answer"].strip():
        raise AssistantGenerationError("Gemini no devolvió una respuesta educativa válida.")

    answer = payload["answer"].strip()[:900]
    try:
        return GeneratedAssistantResponse.model_validate({**payload, "answer": answer})
    except ValidationError:
        logger.warning("[ASISTENTE] Visual o campos auxiliares inválidos; se conserva solo el texto.")
        return GeneratedAssistantResponse(answer=answer)


def generate_educational_content(prompt: str) -> GeneratedAssistantResponse:
    if not settings.gemini_apikey:
        raise AssistantGenerationError("GEMINI_APIKEY no está configurada.")

    client = genai.Client(
        api_key=settings.gemini_apikey,
        http_options={"timeout": 10000},
    )
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
    except genai_errors.APIError as error:
        raise AssistantGenerationError("Gemini no pudo completar la explicación.") from error

    if not response or not response.text:
        raise AssistantGenerationError("Gemini no devolvió contenido.")
    return parse_assistant_response(response.text)


# Mock para pruebas unitarias automatizadas (evita gastar cuota)
_mock_gemini_func = None


def set_mock_gemini(func):
    """Permite inyectar una función simulada para pruebas sin gastar cuota."""
    global _mock_gemini_func
    _mock_gemini_func = func


def _call_gemini_sync(prompt: str) -> Optional[str]:
    """Ejecuta la llamada sincrónica al cliente oficial google-genai."""
    if _mock_gemini_func:
        return _mock_gemini_func(prompt)

    if not settings.gemini_apikey:
        logger.warning("[GEMINI AVISO] GEMINI_APIKEY no configurada. Omitiendo explicación por IA.")
        return None

    client = genai.Client(api_key=settings.gemini_apikey, http_options={"timeout": 10000})
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
    except Exception as e:
        err_msg = str(e).lower()
        if ("no longer available" in err_msg or "not_found" in err_msg) and settings.gemini_model != "gemini-3.8-flash":
            logger.info("[GEMINI] Modelo %s no disponible. Intentando con gemini-3.8-flash...", settings.gemini_model)
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=prompt,
            )
        else:
            raise e
    if response and response.text:
        return response.text.strip()
    return None


async def explain_alert_background(alert_dict: dict):
    """
    Tarea en segundo plano que solicita explicación a Gemini,
    actualiza la base de datos y re-transmite la alerta enriquecida por /ws/alerts.
    """
    level = alert_dict.get("level")
    crew_id = alert_dict.get("crewId")
    alert_id = alert_dict.get("id")

    # Filtro: Solo warning, critical o SOS (nunca lecturas normales ni pings)
    if level not in ["critical", "warning"]:
        return

    # Rate limiting: 1 llamada cada 30s por tripulante
    now = time.time()
    last_call = _last_gemini_call.get(crew_id, 0.0)
    if (now - last_call) < GEMINI_COOLDOWN_SECONDS and not _mock_gemini_func:
        logger.info("[GEMINI] Llamada omitida por rate-limit (máximo 1 cada 30s por tripulante para %s)", crew_id)
        return

    _last_gemini_call[crew_id] = now

    # Obtener contexto de últimos signos vitales
    latest = get_latest_vitals(crew_id)
    vitals_summary = ", ".join([f"{k}: {v['value']} {v['unit']}" for k, v in latest.items()]) if latest else "Sin lecturas previas registradas."

    prompt = f"""
Eres un asistente médico de soporte vital para la misión espacial Dinopad (NASA Space Apps).
Se ha detectado una alerta médica en el tripulante '{crew_id}':
- Título: {alert_dict.get('title')} (Nivel: {level})
- Descripción: {alert_dict.get('message')}
- Acción de protocolo: {alert_dict.get('action')}
- Últimos signos vitales: {vitals_summary}

Instrucciones:
1. Explica brevemente la situación fisiológica en el entorno espacial (microgravedad/cabina) y da una recomendación operativa concisa.
2. Longitud máxima: 3 frases en español.
3. Aclara explícitamente en la última frase que esta información es de apoyo y NO constituye un diagnóstico médico clínico.
"""

    logger.info("[GEMINI] Solicitando análisis de IA para alerta %s (%s)...", alert_id, alert_dict.get('title'))

    try:
        # Timeout estricto de 10 segundos
        explanation = await asyncio.wait_for(
            asyncio.to_thread(_call_gemini_sync, prompt),
            timeout=10.0,
        )

        if explanation:
            logger.info("[GEMINI EXITO] Explicación generada para alerta %s:\n%s", alert_id, explanation)
            # 1. Actualizar en base de datos
            update_alert_ai(alert_id, explanation)

            # 2. Re-transmitir la alerta enriquecida por WebSocket (mismo id)
            alert_dict["aiExplanation"] = explanation
            ws_manager.broadcast_alert_threadsafe(alert_dict)

    except asyncio.TimeoutError:
        logger.warning("[GEMINI AVISO] Timeout de 10 s agotado al contactar Gemini para alerta %s.", alert_id)
    except Exception as e:
        logger.warning("[GEMINI AVISO] Error al generar explicación con Gemini: %s. La alerta sigue activa con texto de regla.", e)
