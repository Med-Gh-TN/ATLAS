import re
from typing import Literal
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User

router = APIRouter(prefix="/ai", tags=["ai-command"])


class CommandIntent(BaseModel):
    action: Literal["search", "summary", "quiz", "flashcards", "navigate", "unknown"]
    target: str | None = None
    parameters: dict = {}


class CommandResponse(BaseModel):
    intent: CommandIntent
    message: str
    action_url: str | None = None


COMMAND_PATTERNS = [
    (
        r"(?:summarize|summary|récapituler).*?(?:last|current|dernier|dernière|my).*?(?:course|cours|lesson|leçon)",
        "summary",
        "last_course",
    ),
    (
        r"(?:what|did|qu').*?(?:studied|learn|study).*?(?:yesterday|hier|last)",
        "navigate",
        "last_document",
    ),
    (r"(?:generate|create|faire).*?(?:quiz|test|quiz from)", "quiz", None),
    (r"(?:generate|create).*?(?:flashcard|carte|deck)", "flashcards", None),
    (r"(?:search|find|chercher|trouver).*", "search", None),
    (r"(?:go to|navigate to|aller à).*", "navigate", None),
    (r"(?:help|aide|commands|commandes)", "unknown", None),
]


def parse_command(query: str) -> CommandIntent:
    query_lower = query.lower().strip()

    for pattern, action, target in COMMAND_PATTERNS:
        if re.search(pattern, query_lower, re.IGNORECASE):
            return CommandIntent(
                action=action, target=target, parameters={"query": query_lower}
            )

    return CommandIntent(action="search", target=None, parameters={"query": query})


@router.post("/command", response_model=CommandResponse)
async def execute_command(
    request: Request, payload: dict, current_user: User = Depends(get_current_user)
):
    """
    US-XX: AI Command Bar endpoint.
    Parses natural language commands and returns structured intent + action URL.
    """
    query = payload.get("query", "")

    if not query.strip():
        return CommandResponse(
            intent=CommandIntent(action="unknown"),
            message="Please enter a command.",
            action_url=None,
        )

    intent = parse_command(query)

    if intent.action == "search":
        return CommandResponse(
            intent=intent,
            message=f"Searching for: {intent.parameters.get('query', query)}",
            action_url=f"/search?q={query.replace(' ', '+')}",
        )

    elif intent.action == "summary":
        return CommandResponse(
            intent=intent,
            message="Generating summary of your last course...",
            action_url="/dashboard",
        )

    elif intent.action == "quiz":
        return CommandResponse(
            intent=intent, message="Opening quiz generator...", action_url="/dashboard"
        )

    elif intent.action == "flashcards":
        return CommandResponse(
            intent=intent,
            message="Opening flashcard generator...",
            action_url="/dashboard",
        )

    elif intent.action == "navigate":
        if intent.target == "last_document":
            return CommandResponse(
                intent=intent,
                message="Resuming your last document...",
                action_url="/dashboard",
            )
        return CommandResponse(
            intent=intent,
            message=f"Navigating as requested...",
            action_url="/dashboard",
        )

    else:
        return CommandResponse(
            intent=intent,
            message="I didn't understand that command. Try: 'search [topic]', 'summarize my last course', or 'generate quiz'.",
            action_url=None,
        )
