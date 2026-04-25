from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import DefaultDict

from fastapi import WebSocket
from redis.asyncio import Redis


logger = logging.getLogger(__name__)


class RedisPubSubWebSocketManager:
    def __init__(self) -> None:
        self._connections: DefaultDict[str, set[WebSocket]] = defaultdict(set)
        self._listeners: dict[str, asyncio.Task[None]] = {}

    async def connect(self, channel: str, websocket: WebSocket, redis_client: Redis) -> None:
        await websocket.accept()
        self._connections[channel].add(websocket)

        if channel not in self._listeners:
            self._listeners[channel] = asyncio.create_task(self._listen(channel, redis_client))

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        if channel in self._connections and websocket in self._connections[channel]:
            self._connections[channel].remove(websocket)

        if channel in self._connections and not self._connections[channel]:
            self._connections.pop(channel, None)
            listener = self._listeners.pop(channel, None)
            if listener is not None:
                listener.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await listener

    async def publish(self, redis_client: Redis, channel: str, payload: dict) -> None:
        await redis_client.publish(channel, json.dumps(payload, default=str))

    async def _listen(self, channel: str, redis_client: Redis) -> None:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data = message.get("data")
                try:
                    payload = json.loads(data) if isinstance(data, str) else data
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed Pub/Sub payload on channel %s", channel)
                    continue

                for websocket in list(self._connections.get(channel, set())):
                    try:
                        await websocket.send_json(payload)
                    except Exception:
                        self._connections[channel].discard(websocket)
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()


import contextlib


realtime_manager = RedisPubSubWebSocketManager()
