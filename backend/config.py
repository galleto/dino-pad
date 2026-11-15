from pathlib import Path
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent
ROOT_ENV = ROOT_DIR / ".env"
BACKEND_ENV = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV), str(BACKEND_ENV)),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base de datos (TimescaleDB / PostgreSQL)
    database_url: str = Field(
        default="",
        validation_alias=AliasChoices("DATABASE_URL", "TIMESCALE_SERVICE_URL"),
    )
    timescale_service_url: str = Field(
        default="",
        validation_alias=AliasChoices("TIMESCALE_SERVICE_URL", "DATABASE_URL"),
    )

    # Google Gemini
    gemini_apikey: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_APIKEY", "GEMINI_API_KEY"),
    )
    gemini_model: str = "gemini-2.5-flash"

    # MQTT Broker
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_password: str = ""
    mqtt_tls: bool = False

    # Entorno
    node_env: str = "development"

    # Orígenes extra permitidos por CORS, separados por coma (p. ej. la página publicada:
    # "https://dinopad.pages.dev,https://dinopad.midominio.tech")
    cors_origins: str = ""

    # Clave del DINO PAD para POST /api/device/ingest (el ESP32 la manda en X-Device-Token).
    # Vacía = la ruta queda apagada.
    device_token: str = ""

    @property
    def cors_origin_list(self) -> list:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_database_url(self) -> str:
        return self.timescale_service_url or self.database_url

    def safe_summary(self) -> dict:
        """Resumen seguro de configuración sin exponer credenciales."""
        return {
            "mqtt_host": self.mqtt_host,
            "mqtt_port": self.mqtt_port,
            "mqtt_tls": self.mqtt_tls,
            "has_mqtt_auth": bool(self.mqtt_user and self.mqtt_password),
            "gemini_model": self.gemini_model,
            "has_gemini_key": bool(self.gemini_apikey),
            "has_database_url": bool(self.effective_database_url),
            "node_env": self.node_env,
            "cors_origins": self.cors_origin_list,
            "has_device_token": bool(self.device_token),
        }


settings = Settings()

