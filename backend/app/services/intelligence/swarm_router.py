"""
@file backend/app/services/intelligence/swarm_router.py
@description SOTA Gemini 3.1 Flash Live Orchestrator.
Prompts now loaded from external Jinja2 templates under 
backend/app/templates/prompts/tutor/ for rapid persona iteration.
@layer Core Logic
@dependencies asyncio, json, logging, os, websockets, pydantic, jinja2
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.parse
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, Optional

from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel, Field

from app.core.config import settings

try:
    import websockets
except ImportError:
    websockets = None

logger = logging.getLogger(__name__)

# ── Jinja2 template environment (reusable) ──────────────────────────────────
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "prompts" / "tutor"
_prompt_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)))

# ── VOICE CATALOG ───────────────────────────────────────────────────────────
VOICE_CATALOG = {
    "Zephyr": {
        "name": "Zephyr",
        "gender": "female",
        "character": "bright, cheerful, warm",
        "description": "Female study companion — warm and encouraging, like Maya",
    },
    "Charon": {
        "name": "Charon",
        "gender": "male",
        "character": "deep, warm, informative, trustworthy",
        "description": "Male study companion — calm, confident, and reassuring, like Miles",
    },
}

DEFAULT_VOICE = "Zephyr"
_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "models/gemini-3.1-flash-live-preview")


def _resolve_voice_config(voice_name: str) -> dict:
    if voice_name in VOICE_CATALOG:
        return VOICE_CATALOG[voice_name]
    logger.warning(f"Unknown voice '{voice_name}' requested; falling back to {DEFAULT_VOICE}.")
    return VOICE_CATALOG[DEFAULT_VOICE]


def _log_task_exception(task: asyncio.Task) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"[Swarm Task] Background task failed: {e}", exc_info=True)


class StreamEvent(BaseModel):
    event_type: str = Field(...)
    payload: Any
    timestamp_ms: int


# ── PROMPT RENDERING ────────────────────────────────────────────────────────
def _render_system_instruction(context_data: Dict[str, Any]) -> str:
    student_info = context_data.get("student_info", {})
    student_name = student_info.get("name", "Student")
    student_level = student_info.get("level", "your level")
    rag_text = str(context_data.get("rag_context", "")).strip()
    raw_voice = context_data.get("voice_name", DEFAULT_VOICE)
    voice_config = _resolve_voice_config(raw_voice)
    voice_name = voice_config["name"]
    voice_gender = voice_config["gender"]

    # Load the correct persona template
    persona_template_name = (
        "persona_female.jinja2" if voice_gender == "female" else "persona_male.jinja2"
    )
    persona_block = _prompt_env.get_template(persona_template_name).render(
        voice_name=voice_name
    )

    # Load and render the main system instruction
    template = _prompt_env.get_template("system_instruction.jinja2")
    return template.render(
        student_name=student_name,
        student_level=student_level,
        voice_name=voice_name,
        voice_gender=voice_gender,
        rag_context=rag_text,
        persona_block=persona_block,
    )


class SwarmOrchestrator:
    def __init__(self):
        raw_key = settings.GEMINI_API_KEY or ""
        self.gemini_api_key = urllib.parse.quote(raw_key.strip(), safe='')
        self.gemini_ws_url = (
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
            f"?key={self.gemini_api_key}"
        )

    async def stream_interaction(
        self,
        session_id: str,
        user_message: str,
        context_data: Dict[str, Any],
        in_queue: Optional[asyncio.Queue] = None,
    ) -> AsyncGenerator[str, None]:

        out_queue: asyncio.Queue[Optional[StreamEvent]] = asyncio.Queue()
        ui_bus: asyncio.Queue[Optional[str]] = asyncio.Queue()
        memory_bus: asyncio.Queue[Optional[str]] = asyncio.Queue()

        loop = asyncio.get_running_loop()
        start_time = loop.time()

        raw_voice = context_data.get("voice_name", DEFAULT_VOICE)
        voice_config = _resolve_voice_config(raw_voice)
        voice_name = voice_config["name"]

        def _get_ms() -> int:
            return int((loop.time() - start_time) * 1000)

        async def _run_node_a_voice():
            if not self.gemini_api_key or websockets is None:
                logger.error("[Node A] GEMINI_API_KEY missing or websockets not installed.")
                await out_queue.put(
                    StreamEvent(event_type="error", payload="GEMINI_API_KEY missing.", timestamp_ms=0)
                )
                return

            try:
                await out_queue.put(
                    StreamEvent(
                        event_type="system",
                        payload="Connecting to Gemini Live...",
                        timestamp_ms=_get_ms(),
                    )
                )
                gemini_setup_complete = asyncio.Event()

                async with websockets.connect(self.gemini_ws_url) as ws:
                    system_instruction = _render_system_instruction(context_data)

                    setup_msg = {
                        "setup": {
                            "model": _LIVE_MODEL,
                            "systemInstruction": {
                                "parts": [{"text": system_instruction}]
                            },
                            "generationConfig": {
                                "responseModalities": ["AUDIO"],
                                "speechConfig": {
                                    "voiceConfig": {
                                        "prebuiltVoiceConfig": {
                                            "voiceName": voice_name,
                                        }
                                    }
                                }
                            },
                            "inputAudioTranscription": {},
                            "outputAudioTranscription": {},
                            "realtimeInputConfig": {
                                "automaticActivityDetection": {
                                    "disabled": False,
                                    "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                                    "endOfSpeechSensitivity": "END_SENSITIVITY_HIGH",
                                }
                            },
                            "tools": [
                                {
                                    "functionDeclarations": [
                                        {
                                            "name": "render_virtual_board",
                                            "description": "Renders a visual board ...",
                                            "parameters": {
                                                "type": "OBJECT",
                                                "properties": {
                                                    "title": {"type": "STRING"},
                                                    "subtitle": {"type": "STRING"},
                                                    "sections": {
                                                        "type": "ARRAY",
                                                        "items": {
                                                            "type": "OBJECT",
                                                            "properties": {
                                                                "id": {"type": "STRING"},
                                                                "title": {"type": "STRING"},
                                                                "type": {"type": "STRING"},
                                                                "items": {"type": "ARRAY", "items": {"type": "STRING"}},
                                                                "colorTheme": {"type": "STRING"},
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        }
                                    ]
                                }
                            ],
                        }
                    }
                    await ws.send(json.dumps(setup_msg))
                    logger.info(f"[Node A] Gemini Live Setup sent. Voice: {voice_name}, Model: {_LIVE_MODEL}.")

                    async def _send_to_gemini():
                        if not in_queue:
                            return
                        try:
                            await asyncio.wait_for(gemini_setup_complete.wait(), timeout=5.0)
                            logger.info("[Node A] 🟢 Setup ACKed by Google. Commencing Audio Transmission.")
                        except asyncio.TimeoutError:
                            logger.error("[Node A] 🛑 Google never ACKed setup. Aborting upstream stream.")
                            return

                        while True:
                            data = await in_queue.get()
                            if data is None or data.get("type") == "close":
                                try:
                                    await ws.send(json.dumps({"clientContent": {"turnComplete": True}}))
                                except Exception:
                                    pass
                                break

                            if data.get("type") == "audio_chunk":
                                b64_audio = data.get("base64", "")
                                audio_msg = {
                                    "realtimeInput": {
                                        "audio": {
                                            "mimeType": "audio/pcm;rate=16000",
                                            "data": b64_audio,
                                        }
                                    }
                                }
                                await ws.send(json.dumps(audio_msg))
                                await asyncio.sleep(0.005)

                    async def _receive_from_gemini():
                        async for message in ws:
                            response = json.loads(message)

                            if "setupComplete" in response:
                                logger.info("[Node A] ✅ Received 'setupComplete' from Gemini.")
                                gemini_setup_complete.set()
                                continue

                            if "serverContent" in response:
                                if not gemini_setup_complete.is_set():
                                    gemini_setup_complete.set()

                                sc = response["serverContent"]

                                if sc.get("interrupted"):
                                    logger.info("[Node A] ⚡ User interrupted. Stopping playback.")
                                    await out_queue.put(
                                        StreamEvent(
                                            event_type="system",
                                            payload="interrupted",
                                            timestamp_ms=_get_ms(),
                                        )
                                    )
                                    continue

                                if "outputTranscription" in sc:
                                    transcript_text = sc["outputTranscription"].get("text", "")
                                    if transcript_text:
                                        logger.debug(f"[Node A] Output transcript: {transcript_text[:80]}...")
                                        await out_queue.put(
                                            StreamEvent(
                                                event_type="transcript",
                                                payload=transcript_text,
                                                timestamp_ms=_get_ms(),
                                            )
                                        )
                                        await ui_bus.put(transcript_text)
                                        await memory_bus.put(transcript_text)

                                model_turn = sc.get("modelTurn", {})
                                for part in model_turn.get("parts", []):
                                    if "functionCall" in part:
                                        call = part["functionCall"]
                                        if call.get("name") == "render_virtual_board":
                                            args = call.get("args", {})
                                            call_id = call.get("id", "")
                                            logger.info(
                                                "[Node A] 🎨 Native UI Tool Called! "
                                                "Pushing VirtualBoard to Canvas."
                                            )
                                            ui_payload = {"component": "VirtualBoard", "props": args}
                                            await out_queue.put(
                                                StreamEvent(
                                                    event_type="ui_hydration",
                                                    payload=ui_payload,
                                                    timestamp_ms=_get_ms(),
                                                )
                                            )
                                            resp = {
                                                "toolResponse": {
                                                    "functionResponses": [
                                                        {
                                                            "id": call_id,
                                                            "name": "render_virtual_board",
                                                            "response": {
                                                                "result": "Board rendered successfully on the student's screen."
                                                            },
                                                        }
                                                    ]
                                                }
                                            }
                                            await ws.send(json.dumps(resp))

                                    if "text" in part:
                                        text_chunk = part["text"]
                                        await out_queue.put(
                                            StreamEvent(
                                                event_type="transcript",
                                                payload=text_chunk,
                                                timestamp_ms=_get_ms(),
                                            )
                                        )
                                        await ui_bus.put(text_chunk)
                                        await memory_bus.put(text_chunk)

                                    if "inlineData" in part:
                                        b64_audio = part["inlineData"]["data"]
                                        await out_queue.put(
                                            StreamEvent(
                                                event_type="audio_chunk",
                                                payload={"base64": b64_audio},
                                                timestamp_ms=_get_ms(),
                                            )
                                        )

                    await asyncio.gather(
                        asyncio.create_task(_send_to_gemini()),
                        asyncio.create_task(_receive_from_gemini()),
                    )

            except Exception as e:
                logger.error(f"[Node A] Gemini Live Error: {e}", exc_info=True)
                await out_queue.put(
                    StreamEvent(
                        event_type="error",
                        payload=f"Gemini API Error: {str(e)}",
                        timestamp_ms=_get_ms(),
                    )
                )
            finally:
                await ui_bus.put(None)
                await memory_bus.put(None)

        # ------------------------------------------------------------------
        # NODE B: THE AUTONOMOUS UI AGENT
        # ------------------------------------------------------------------
        async def _run_node_b_ui():
            try:
                from app.services.intelligence.agents.ui_agent import UIAgent

                ui_agent = UIAgent()
                accumulated_transcript = ""
                last_eval_time = loop.time()

                async def _trigger_ui_generation(transcript: str):
                    ui_payload = await ui_agent.evaluate_transcript(transcript)
                    if ui_payload:
                        await out_queue.put(
                            StreamEvent(
                                event_type="ui_hydration",
                                payload=ui_payload,
                                timestamp_ms=_get_ms(),
                            )
                        )

                while True:
                    try:
                        chunk = await asyncio.wait_for(ui_bus.get(), timeout=1.0)
                        if chunk is None:
                            break
                        accumulated_transcript += chunk + " "
                        ui_bus.task_done()
                    except asyncio.TimeoutError:
                        pass

                    current_time = loop.time()
                    interval = float(os.getenv("NODE_B_INTERVAL_SECONDS", "20"))
                    if current_time - last_eval_time > interval and len(accumulated_transcript.strip()) >= 80:
                        transcript_to_eval = accumulated_transcript
                        accumulated_transcript = ""
                        last_eval_time = current_time

                        task = asyncio.create_task(_trigger_ui_generation(transcript_to_eval))
                        task.add_done_callback(_log_task_exception)

            except Exception as e:
                logger.error(f"[Node B] UI Loop Error: {e}", exc_info=True)

        # ------------------------------------------------------------------
        # NODE C: THE MEMORY CONTROLLER
        # ------------------------------------------------------------------
        async def _run_node_c_memory():
            try:
                from app.services.intelligence.memory_controller import MemoryController

                memory_agent = MemoryController()
                accumulated_transcript = ""
                last_eval_time = loop.time()

                student_id = context_data.get("student_id", "unknown")
                course_id = context_data.get("course_id", "unknown")

                async def _process_memory(text_segment: str):
                    insights = await memory_agent.extract_insights(text_segment)
                    if insights and (insights.get("mastery") or insights.get("weaknesses")):
                        ui_payload = {
                            "component": "StickyNotes",
                            "props": {
                                "mastery": insights.get("mastery", []),
                                "weaknesses": insights.get("weaknesses", []),
                            },
                        }
                        await out_queue.put(
                            StreamEvent(
                                event_type="ui_hydration",
                                payload=ui_payload,
                                timestamp_ms=_get_ms(),
                            )
                        )
                        await memory_agent.persist_to_sql(
                            student_id=student_id,
                            course_id=course_id,
                            insights=insights,
                            transcript_segment=text_segment,
                        )

                while True:
                    try:
                        chunk = await asyncio.wait_for(memory_bus.get(), timeout=1.0)
                        if chunk is None:
                            break
                        accumulated_transcript += chunk + " "
                        memory_bus.task_done()
                    except asyncio.TimeoutError:
                        pass

                    current_time = loop.time()
                    if current_time - last_eval_time > 15 and len(accumulated_transcript.strip()) > 20:
                        segment = accumulated_transcript
                        accumulated_transcript = ""
                        last_eval_time = current_time

                        task = asyncio.create_task(_process_memory(segment))
                        task.add_done_callback(_log_task_exception)

            except Exception as e:
                logger.error(f"[Node C] Memory Loop Error: {e}", exc_info=True)

        # ------------------------------------------------------------------
        # ORCHESTRATOR EXECUTION
        # ------------------------------------------------------------------
        tasks = [
            asyncio.create_task(_run_node_a_voice()),
            asyncio.create_task(_run_node_b_ui()),
            asyncio.create_task(_run_node_c_memory()),
        ]

        async def _monitor():
            await asyncio.gather(*tasks, return_exceptions=True)
            await out_queue.put(None)

        monitor_task = asyncio.create_task(_monitor())

        try:
            while True:
                event = await out_queue.get()
                if event is None:
                    break
                yield event.model_dump_json()
                out_queue.task_done()
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
            if not monitor_task.done():
                monitor_task.cancel()