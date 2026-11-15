from typing import Literal, Optional
from pydantic import BaseModel, Field

CrewId = Literal["comandante", "botanico", "ingeniero"]
IndicatorId = Literal["hr", "spo2", "temp", "bp", "glu", "sleep", "mood"]
Unit = Literal["lpm", "%", "°C", "mmHg", "mg/dL", "h", "/10"]
ReadingSource = Literal["live", "simulated"]
ReadingQuality = Literal["ok", "no_signal"]
AlertLevel = Literal["critical", "warning", "info"]
AlertOrigin = Literal["rule", "button"]


class VitalReading(BaseModel):
    """Contrato fijo de lectura con el frontend."""
    crewId: CrewId
    indicatorId: IndicatorId
    value: Optional[float] = None
    unit: Unit
    timestamp: int  # Epoch en milisegundos
    source: ReadingSource = "simulated"
    quality: ReadingQuality = "ok"


class AlertMessage(BaseModel):
    """Mensaje entrante por MQTT en dinopad/alertas."""
    crewId: CrewId
    type: Literal["sos", "ping"]
    timestamp: int  # Epoch en milisegundos


class DeviceStatus(BaseModel):
    """Mensaje de telemetría de dispositivo en dinopad/estado."""
    deviceId: str
    crewId: CrewId
    status: str
    batteryPct: int = Field(ge=0, le=100)
    rssi: int
    timestamp: int  # Epoch en milisegundos


class StoredAlert(BaseModel):
    """Alerta completa para base de datos y WebSockets."""
    id: str
    ts: int  # timestamp en ms
    crewId: CrewId
    indicatorId: Optional[IndicatorId] = None
    level: AlertLevel
    title: str
    message: str
    action: str
    origin: AlertOrigin
    aiExplanation: Optional[str] = None

