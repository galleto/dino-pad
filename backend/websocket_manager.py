import asyncio
import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger("dinopad.ws")


class WebSocketManager:
    def __init__(self):
        self.vitals_connections: Set[WebSocket] = set()
        self.alerts_connections: Set[WebSocket] = set()
        self.device_connections: Set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def connect_vitals(self, websocket: WebSocket):
        await websocket.accept()
        self.vitals_connections.add(websocket)
        logger.info("[WS] Cliente conectado a /ws/vitals (Total: %d)", len(self.vitals_connections))

    def disconnect_vitals(self, websocket: WebSocket):
        self.vitals_connections.discard(websocket)
        logger.info("[WS] Cliente desconectado de /ws/vitals (Total: %d)", len(self.vitals_connections))

    async def connect_alerts(self, websocket: WebSocket):
        await websocket.accept()
        self.alerts_connections.add(websocket)
        logger.info("[WS] Cliente conectado a /ws/alerts (Total: %d)", len(self.alerts_connections))

    def disconnect_alerts(self, websocket: WebSocket):
        self.alerts_connections.discard(websocket)
        logger.info("[WS] Cliente desconectado de /ws/alerts (Total: %d)", len(self.alerts_connections))

    async def connect_device(self, websocket: WebSocket):
        await websocket.accept()
        self.device_connections.add(websocket)
        logger.info("[WS] Cliente conectado a /ws/device (Total: %d)", len(self.device_connections))

    def disconnect_device(self, websocket: WebSocket):
        self.device_connections.discard(websocket)
        logger.info("[WS] Cliente desconectado de /ws/device (Total: %d)", len(self.device_connections))

    async def _broadcast_device_coro(self, data: dict):
        for ws in list(self.device_connections):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_device(ws)

    def broadcast_device_threadsafe(self, data: dict):
        """Transmite telemetría o estado del menú del DINO PAD ({"type": "status" | "ui", ...})."""
        if not self.device_connections:
            return
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast_device_coro(data), self.loop)

    async def _broadcast_vitals_coro(self, data: dict):
        for ws in list(self.vitals_connections):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_vitals(ws)

    async def _broadcast_alerts_coro(self, data: dict):
        for ws in list(self.alerts_connections):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_alerts(ws)

    def broadcast_vital_threadsafe(self, data: dict):
        """Transmite una lectura desde un hilo secundario (como el callback de MQTT)."""
        if not self.vitals_connections:
            return
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast_vitals_coro(data), self.loop)

    def broadcast_alert_threadsafe(self, data: dict):
        """Transmite una alerta desde un hilo secundario."""
        if not self.alerts_connections:
            return
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast_alerts_coro(data), self.loop)


ws_manager = WebSocketManager()

