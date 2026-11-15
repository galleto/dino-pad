import json
import logging
from typing import Callable, List, Optional
import paho.mqtt.client as mqtt
from pydantic import ValidationError

from backend.config import settings
from backend.models import VitalReading, AlertMessage, DeviceStatus

logger = logging.getLogger("dinopad.mqtt")

TOPIC_VITALS = "dinopad/vitals"
TOPIC_ALERTS = "dinopad/alertas"
TOPIC_STATUS = "dinopad/estado"

# Tipo de handlers para registrar observadores
VitalsHandler = Callable[[VitalReading], None]
AlertsHandler = Callable[[AlertMessage], None]
StatusHandler = Callable[[DeviceStatus], None]


class DinopadMQTTClient:
    def __init__(self):
        # Compatibilidad Paho v2 con CallbackAPIVersion y protocolo MQTTv311 estándar
        try:
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id="dinopad-backend",
                protocol=mqtt.MQTTv311,
            )
        except (AttributeError, TypeError):
            self.client = mqtt.Client(client_id="dinopad-backend", protocol=mqtt.MQTTv311)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        self.vitals_handlers: List[VitalsHandler] = []
        self.alerts_handlers: List[AlertsHandler] = []
        self.status_handlers: List[StatusHandler] = []

        self._connected = False

    def on_vitals(self, handler: VitalsHandler):
        self.vitals_handlers.append(handler)

    def on_alert(self, handler: AlertsHandler):
        self.alerts_handlers.append(handler)

    def on_status(self, handler: StatusHandler):
        self.status_handlers.append(handler)

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        rc_code = getattr(rc, "value", rc)
        if rc_code == 0:
            self._connected = True
            logger.info("Conectado exitosamente al broker MQTT en %s:%s", settings.mqtt_host, settings.mqtt_port)
            client.subscribe([
                (TOPIC_VITALS, 0),
                (TOPIC_ALERTS, 0),
                (TOPIC_STATUS, 0),
            ])
            logger.info("Suscrito a topicos: %s, %s, %s", TOPIC_VITALS, TOPIC_ALERTS, TOPIC_STATUS)
        else:
            logger.warning("Conexion al broker MQTT rechazada (codigo %s)", rc_code)

    def _on_disconnect(self, client, userdata, disconnect_flags_or_rc, reason_code=None, properties=None):
        self._connected = False
        logger.warning("Desconectado del broker MQTT. Intentando reconectar automaticamente...")

    def _on_message(self, client, userdata, msg):
        try:
            raw_payload = msg.payload.decode("utf-8")
            data = json.loads(raw_payload)
        except Exception as e:
            logger.warning("[MQTT INVALID JSON] Topico %s: %s (payload: %s)", msg.topic, e, msg.payload[:100])
            return

        topic = msg.topic
        if topic == TOPIC_VITALS:
            try:
                reading = VitalReading.model_validate(data)
                val_str = f"{reading.value} {reading.unit}" if reading.value is not None else "--"
                logger.info("[VITALS] %s | %s: %s | quality=%s", reading.crewId, reading.indicatorId, val_str, reading.quality)
                for handler in self.vitals_handlers:
                    try:
                        handler(reading)
                    except Exception as handler_err:
                        logger.error("Error en handler de vitals: %s", handler_err)
            except ValidationError as ve:
                logger.warning("[MQTT INVALID VITALS] Topico %s: %s", topic, ve.errors())

        elif topic == TOPIC_ALERTS:
            try:
                alert = AlertMessage.model_validate(data)
                logger.info("[ALERTA] %s | Tipo: %s", alert.crewId, alert.type.upper())
                for handler in self.alerts_handlers:
                    try:
                        handler(alert)
                    except Exception as handler_err:
                        logger.error("Error en handler de alertas: %s", handler_err)
            except ValidationError as ve:
                logger.warning("[MQTT INVALID ALERT] Topico %s: %s", topic, ve.errors())

        elif topic == TOPIC_STATUS:
            try:
                status = DeviceStatus.model_validate(data)
                logger.info("[ESTADO] Dispositivo %s (%s) | %s | Bat: %d%% | RSSI: %d dBm",
                            status.deviceId, status.crewId, status.status, status.batteryPct, status.rssi)
                for handler in self.status_handlers:
                    try:
                        handler(status)
                    except Exception as handler_err:
                        logger.error("Error en handler de estado: %s", handler_err)
            except ValidationError as ve:
                logger.warning("[MQTT INVALID STATUS] Topico %s: %s", topic, ve.errors())
        else:
            logger.debug("[MQTT UNHANDLED TOPIC] %s", topic)

    def start(self):
        """Inicia conexion y bucle en segundo plano. Nunca tira la aplicacion si el broker no esta disponible."""
        if settings.mqtt_user and settings.mqtt_password:
            self.client.username_pw_set(settings.mqtt_user, settings.mqtt_password)

        if settings.mqtt_tls:
            self.client.tls_set()

        try:
            self.client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)
            self.client.loop_start()
            logger.info("Cliente MQTT iniciado en segundo plano hacia %s:%s", settings.mqtt_host, settings.mqtt_port)
        except Exception as e:
            logger.warning("No se pudo iniciar conexion inmediata con el broker MQTT (%s:%s): %s. Reintentara en segundo plano.",
                           settings.mqtt_host, settings.mqtt_port, e)
            try:
                self.client.loop_start()
            except Exception:
                pass

    def stop(self):
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass


mqtt_service = DinopadMQTTClient()
