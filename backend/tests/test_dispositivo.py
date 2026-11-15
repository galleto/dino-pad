"""Prueba de punta a punta del canal del DINO PAD (firmware dinopad_pipboy -> MQTT -> backend -> web).

Publica en un broker local de prueba los MISMOS JSON que arma firmware/dinopad_pipboy/red_mqtt.cpp
y comprueba lo que recibe la web:
  - /ws/device: telemetría del tracker ({"type":"status"}) y estado del menú ({"type":"ui"})
  - /ws/vitals: vitales simulados del ESP32 (timestamp 0 -> hora del servidor)
  - /ws/alerts: SOS de una persona
  - GET /api/device/latest y la foto inicial al conectarse a /ws/device
  - CORS para la página publicada (CORS_ORIGINS)

Uso:  python backend/tests/test_dispositivo.py   (no necesita base de datos ni internet)
"""
import asyncio
import json
import sys
import threading
import time
import urllib.request
from pathlib import Path

import paho.mqtt.client as mqtt
import uvicorn
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.config import settings  # noqa: E402

PUERTO_MQTT = 18885
PUERTO_HTTP = 8090
BASE = f"http://127.0.0.1:{PUERTO_HTTP}"
WS = f"ws://127.0.0.1:{PUERTO_HTTP}"
ORIGEN_PAGINA = "https://dinopad-prueba.pages.dev"

# Copias literales del formato de red_mqtt.cpp (valores de ejemplo)
VITAL_SIN_HORA = '{"crewId":"comandante","indicatorId":"hr","value":76,"unit":"lpm","timestamp":0,"source":"simulated","quality":"ok"}'
ESTADO = ('{"deviceId":"dinopad-82a4","crewId":"comandante","status":"CONECTADO","batteryPct":87,"rssi":-58,'
          '"timestamp":0,"source":"live","power":"battery","ble":"CONECTADO","voltage":4.02,"channelUtil":3.1,'
          '"airTx":0.4,"uptimeS":11520,"ambientTempC":22.6,"lightPct":58,"stale":false,"wifiRssi":-61}')
UI = ('{"type":"ui","crewId":"comandante","deviceId":"dinopad-82a4","tab":3,"tabName":"VITAL","mode":"DENTRO",'
      '"event":"SELECCIONAR","demo":false,"timestamp":0,"source":"live"}')
SOS = '{"crewId":"comandante","type":"sos","timestamp":0}'

fallas = []


def ok(cond, msg):
    print(("OK    " if cond else "FALLA ") + msg)
    if not cond:
        fallas.append(msg)


async def recibir(ws, cond, segundos=4.0):
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=fin - time.time()))
        except asyncio.TimeoutError:
            break
        if cond(m):
            return m
    return None


async def flujo():
    from backend.rules import reset_antispam
    reset_antispam()
    async with websockets.connect(f"{WS}/ws/device") as wd, websockets.connect(f"{WS}/ws/vitals") as wv, \
            websockets.connect(f"{WS}/ws/alerts") as wa:
        pub = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id="prueba-dinopad")
        pub.connect("127.0.0.1", PUERTO_MQTT, 60)
        pub.loop_start()
        time.sleep(0.3)
        antes = int(time.time() * 1000)
        for tema, carga in [("dinopad/estado", ESTADO), ("dinopad/ui", UI), ("dinopad/vitals", VITAL_SIN_HORA), ("dinopad/alertas", SOS)]:
            pub.publish(tema, carga)

        st = await recibir(wd, lambda m: m.get("type") == "status")
        ok(st is not None, "/ws/device recibe la telemetría")
        if st:
            ok(st["batteryPct"] == 87 and st["voltage"] == 4.02 and st["ambientTempC"] == 22.6 and st["source"] == "live",
               "telemetría con batería, voltaje, temperatura ambiente y source live")
            ok(st["timestamp"] >= antes, "telemetría sin hora -> hora del servidor")
        ui = await recibir(wd, lambda m: m.get("type") == "ui")
        ok(ui is not None and ui["tabName"] == "VITAL" and ui["mode"] == "DENTRO" and ui["demo"] is False,
           "/ws/device recibe el estado del menú (espejo)")
        v = await recibir(wv, lambda m: m.get("indicatorId") == "hr")
        ok(v is not None and v["source"] == "simulated" and v["value"] == 76, "/ws/vitals recibe el BPM simulado del ESP32")
        ok(v is not None and v["timestamp"] >= antes, "vital con timestamp 0 -> hora del servidor")
        a = await recibir(wa, lambda m: "SOS" in (m.get("title") or ""))
        ok(a is not None and a["level"] == "critical" and a["crewId"] == "comandante", "/ws/alerts recibe el SOS (crítico)")
        pub.loop_stop()

    with urllib.request.urlopen(f"{BASE}/api/device/latest") as r:
        snap = json.load(r)
    ok(len(snap["status"]) == 1 and len(snap["ui"]) == 1, "GET /api/device/latest devuelve telemetría y menú")
    async with websockets.connect(f"{WS}/ws/device") as wd2:
        primeros = [json.loads(await asyncio.wait_for(wd2.recv(), 2)) for _ in range(2)]
    ok({m.get("type") for m in primeros} == {"status", "ui"}, "al conectarse a /ws/device llega la foto actual")

    req = urllib.request.Request(f"{BASE}/health", headers={"Origin": ORIGEN_PAGINA})
    with urllib.request.urlopen(req) as r:
        ok(r.headers.get("access-control-allow-origin") == ORIGEN_PAGINA, "CORS permite la página publicada (CORS_ORIGINS)")
        salud = json.load(r)
    ok(salud.get("devices") == 1, "/health cuenta los dispositivos")


def main():
    settings.mqtt_host = "127.0.0.1"
    settings.mqtt_port = PUERTO_MQTT
    settings.mqtt_tls = False
    settings.cors_origins = ORIGEN_PAGINA   # antes de importar la app (el CORS se arma al importar)
    settings.database_url = settings.timescale_service_url = ""

    from backend.simulator.mock_broker import MiniMQTTBroker
    broker = MiniMQTTBroker(host="127.0.0.1", port=PUERTO_MQTT)
    threading.Thread(target=lambda: asyncio.run(broker.start()), daemon=True).start()
    time.sleep(0.4)
    from backend.main import app
    server = uvicorn.Server(uvicorn.Config(app=app, host="127.0.0.1", port=PUERTO_HTTP, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    time.sleep(1.5)
    try:
        asyncio.run(flujo())
    finally:
        server.should_exit = True
        time.sleep(0.5)
    print("TODO OK" if not fallas else f"{len(fallas)} FALLAS")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
