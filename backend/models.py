from typing import List, Literal, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

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


AssistantReadingStatus = Literal["ok", "warn", "crit", "nodata"]
AssistantVisualType = Literal["gauge", "range", "trend", "diagram", "none"]


class AssistantReading(BaseModel):
    indicatorId: IndicatorId
    name: str = Field(max_length=80)
    value: Optional[float] = None
    unit: Unit
    status: AssistantReadingStatus
    rangeOk: Tuple[float, float]
    rangeWarn: Tuple[float, float]
    history: List[float] = Field(default_factory=list, max_length=60)


class AssistantAlert(BaseModel):
    level: AlertLevel
    title: str = Field(max_length=128)
    message: str = Field(max_length=500)
    indicatorId: Optional[IndicatorId] = None


class AssistantScreenContext(BaseModel):
    route: str = Field(max_length=48)
    pageTitle: str = Field(max_length=80)
    crewId: CrewId
    crewName: str = Field(max_length=100)
    readings: List[AssistantReading] = Field(default_factory=list, max_length=20)
    alerts: List[AssistantAlert] = Field(default_factory=list, max_length=20)
    selectedTerm: Optional[str] = Field(default=None, max_length=48)
    termLabel: Optional[str] = Field(default=None, max_length=100)
    termDefinition: Optional[str] = Field(default=None, max_length=500)


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1200)
    screenContext: AssistantScreenContext
    learnedConcepts: List[str] = Field(default_factory=list, max_length=30)
    assistantId: Optional[UUID] = None
    threadId: Optional[UUID] = None
    expanded: bool = False
    visualRequest: bool = False

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("La pregunta no puede estar vacía.")
        return value.strip()


class AssistantVisual(BaseModel):
    type: AssistantVisualType = "none"
    indicatorId: Optional[IndicatorId] = None
    conceptId: Optional[str] = Field(default=None, max_length=48)


class GeneratedAssistantResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=900)
    conceptId: Optional[str] = Field(default=None, max_length=48)
    relatedConcepts: List[str] = Field(default_factory=list, max_length=5)
    visual: AssistantVisual = Field(default_factory=AssistantVisual)
    followUps: List[str] = Field(default_factory=list, max_length=4)


class AssistantResponse(GeneratedAssistantResponse):
    assistantId: Optional[UUID] = None
    threadId: Optional[UUID] = None
    source: Literal["gemini"] = "gemini"
    backboardAvailable: bool = False

