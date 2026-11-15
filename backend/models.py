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
    # Opcionales que manda dinopad_pipboy (telemetría real del T1000-E leída por BLE)
    source: ReadingSource = "live"
    power: Optional[Literal["usb", "battery"]] = None
    ble: Optional[str] = None            # estado del enlace BLE ESP32 <-> T1000-E
    voltage: Optional[float] = None
    channelUtil: Optional[float] = None  # % uso del canal LoRa
    airTx: Optional[float] = None        # % tiempo al aire transmitiendo
    uptimeS: Optional[int] = None
    ambientTempC: Optional[float] = None  # temperatura del ENTORNO (no es la corporal "temp")
    lightPct: Optional[float] = None
    stale: Optional[bool] = None         # métricas guardadas de antes de un reinicio del tracker
    wifiRssi: Optional[int] = None


class DeviceUi(BaseModel):
    """Estado del menú del DINO PAD en dinopad/ui (espejo de la pantalla en la web)."""
    type: Literal["ui"] = "ui"
    crewId: CrewId
    deviceId: str
    tab: int = Field(ge=0, le=4)
    tabName: str
    mode: Literal["MENU", "DENTRO", "SOS"]
    event: str = ""
    demo: bool = False                   # el evento lo generó el guion DEMO del firmware
    timestamp: int
    source: ReadingSource = "live"


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

