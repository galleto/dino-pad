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

    # Backboard persistent assistant memory
    backboard_api_key: str = ""

    # MQTT Broker
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_password: str = ""
    mqtt_tls: bool = False

    # Entorno
    node_env: str = "development"

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
            "has_backboard_key": bool(self.backboard_api_key),
            "has_database_url": bool(self.effective_database_url),
            "node_env": self.node_env,
        }


settings = Settings()

