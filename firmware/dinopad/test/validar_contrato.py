"""Valida mensajes "topico<TAB>json" (stdin) contra los modelos del backend.

Usa backend/models.py del propio repo (VitalReading, AlertMessage, DeviceStatus),
asi el test falla si el backend cambia el contrato. Tambien comprueba que los
mensajes que publicaba el firmware ANTES de este cambio son rechazados.
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ))
from backend.models import AlertMessage, DeviceStatus, VitalReading  # noqa: E402
from pydantic import ValidationError  # noqa: E402

MODELO = {"dinopad/vitals": VitalReading, "dinopad/alertas": AlertMessage, "dinopad/estado": DeviceStatus}

fallos = 0
n = 0
for linea in sys.stdin:
    linea = linea.rstrip("\n")
    if not linea:
        continue
    topico, _, carga = linea.partition("\t")
    n += 1
    if topico not in MODELO:
        print(f"FALLA topico desconocido: {topico}")
        fallos += 1
        continue
    modelo = MODELO[topico]
    try:
        datos = json.loads(carga)
        modelo.model_validate(datos)
        extra = set(datos) - set(modelo.model_fields)
        if extra:
            raise ValueError(f"campos que el modelo no conoce: {sorted(extra)}")
        print(f"OK   {topico:16} {modelo.__name__:13} {carga}")
    except (ValueError, ValidationError) as e:
        print(f"FALLA {topico} {carga}\n      {e}")
        fallos += 1

# Lo que publicaba firmware/dinopad antes: debe ser rechazado
VIEJOS = [
    ("dinopad/estado", '{"device":"Dinopad","status":"ONLINE"}'),
    ("dinopad/estado", '{"evento":"PING","uptime_s":12}'),
    ("dinopad/alertas", '{"alerta":"SOS","prioridad":"ALTA"}'),
]
for topico, carga in VIEJOS:
    try:
        MODELO[topico].model_validate(json.loads(carga))
        print(f"FALLA el formato viejo deberia ser rechazado: {carga}")
        fallos += 1
    except ValidationError:
        print(f"OK   formato viejo rechazado: {topico} {carga}")

if n == 0:
    print("FALLA no llego ningun mensaje para validar")
    fallos += 1

print(f"\n{n} mensajes validados. {'TODO OK' if not fallos else f'HAY {fallos} FALLO(S)'}")
sys.exit(1 if fallos else 0)
