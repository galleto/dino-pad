import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from starlette.requests import Request

from backend.gemini_service import AssistantGenerationError, parse_assistant_response
from backend.main import _assistant_request_times, api_educational_assistant
from backend.models import (
    AssistantRequest,
    AssistantResponse,
    AssistantScreenContext,
    GeneratedAssistantResponse,
)


def make_request():
    return AssistantRequest(
        question="¿Qué significa SpO₂?",
        screenContext=AssistantScreenContext(
            route="riesgos",
            pageTitle="Riesgos NASA",
            crewId="comandante",
            crewName="Cmdr. Elena Vega",
            selectedTerm="spo2",
            termLabel="Oxigenación (SpO₂)",
            termDefinition="Indica cuánto oxígeno transporta la sangre.",
        ),
    )


class AssistantTests(unittest.TestCase):
    def test_invalid_visual_keeps_text_response(self):
        response = parse_assistant_response(json.dumps({
            "answer": "SpO₂ indica cuánto oxígeno transporta la sangre.",
            "conceptId": "spo2",
            "visual": {"type": "script"},
        }))

        self.assertEqual(response.answer, "SpO₂ indica cuánto oxígeno transporta la sangre.")
        self.assertEqual(response.visual.type, "none")

    def test_malformed_json_is_rejected(self):
        with self.assertRaises(AssistantGenerationError):
            parse_assistant_response("not-json")

    def test_assistant_endpoint_returns_response_model(self):
        request = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/assistant",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
            "http_version": "1.1",
        })
        expected = AssistantResponse(answer="SpO₂ es una medida de oxígeno en sangre.", conceptId="spo2")
        _assistant_request_times.clear()

        with patch("backend.main.generate_assistant_response", new=AsyncMock(return_value=expected)):
            result = asyncio.run(api_educational_assistant(make_request(), request))

        self.assertEqual(result.conceptId, "spo2")
        self.assertEqual(result.answer, expected.answer)

    def test_local_learned_concept_is_still_saved_to_backboard(self):
        request = make_request()
        request.learnedConcepts = ["spo2"]
        assistant_id, thread_id = uuid4(), uuid4()
        generated = GeneratedAssistantResponse(
            answer="La oxigenación indica cuánto oxígeno transporta la sangre.",
            conceptId="spo2",
        )

        with (
            patch("backend.assistant_service.settings.backboard_api_key", "configured"),
            patch("backend.assistant_service.ensure_crew_session", return_value=(assistant_id, thread_id)),
            patch("backend.assistant_service.search_concept_memories", return_value=[]),
            patch("backend.assistant_service.persist_concept") as persist,
            patch("backend.assistant_service.generate_educational_content", return_value=generated),
        ):
            from backend.assistant_service import generate_assistant_response

            response = asyncio.run(generate_assistant_response(request))

        self.assertTrue(response.backboardAvailable)
        persist.assert_called_once()


if __name__ == "__main__":
    unittest.main()
