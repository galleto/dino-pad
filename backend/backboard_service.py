import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

from backend.config import settings

logger = logging.getLogger("dinopad.backboard")

BACKBOARD_API = "https://app.backboard.io/api"
BACKBOARD_TIMEOUT_SECONDS = 5
PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "assistant_system_prompt.txt"


class BackboardError(RuntimeError):
    pass


def _post(path: str, payload: dict) -> dict:
    if not settings.backboard_api_key:
        raise BackboardError("BACKBOARD_API_KEY no está configurada.")
    request = Request(
        f"{BACKBOARD_API}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "X-API-Key": settings.backboard_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=BACKBOARD_TIMEOUT_SECONDS) as response:
            body = response.read(64_000)
    except HTTPError as error:
        raise BackboardError(f"Backboard respondió HTTP {error.code}.") from error
    except (TimeoutError, URLError) as error:
        raise BackboardError("No se pudo conectar con Backboard.") from error

    try:
        result = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BackboardError("Backboard devolvió una respuesta JSON inválida.") from error
    if not isinstance(result, dict):
        raise BackboardError("Backboard devolvió una respuesta inesperada.")
    return result


def ensure_crew_session(
    crew_id: str,
    assistant_id: Optional[UUID],
    thread_id: Optional[UUID],
) -> Tuple[UUID, UUID]:
    if assistant_id is None:
        prompt = PROMPT_PATH.read_text(encoding="utf-8")
        assistant = _post("/assistants", {
            "name": f"Dinopad educativo · {crew_id}",
            "system_prompt": prompt,
        })
        assistant_id = UUID(assistant["assistant_id"])

    if thread_id is None:
        thread = _post(f"/assistants/{quote(str(assistant_id), safe='')}/threads", {})
        thread_id = UUID(thread["thread_id"])

    return assistant_id, thread_id


def search_concept_memories(assistant_id: UUID, query: str) -> List[str]:
    result = _post(
        f"/assistants/{quote(str(assistant_id), safe='')}/memories/search",
        {"query": query[:500], "limit": 5},
    )
    memories = result.get("memories", [])
    if not isinstance(memories, list):
        return []
    return [
        item["content"][:600]
        for item in memories
        if isinstance(item, dict) and isinstance(item.get("content"), str)
    ][:5]


def persist_concept(
    assistant_id: UUID,
    thread_id: UUID,
    concept_id: str,
    label: str,
    definition: str,
) -> None:
    content = f"Concepto educativo visto: {concept_id} ({label}). {definition}"[:900]
    _post("/threads/messages", {
        "assistant_id": str(assistant_id),
        "thread_id": str(thread_id),
        "content": content,
        "send_to_llm": "false",
        "memory": "off",
    })
    _post(
        f"/assistants/{quote(str(assistant_id), safe='')}/memories",
        {
            "content": content,
            "metadata": {"source": "dinopad-educativo", "conceptId": concept_id},
        },
    )

