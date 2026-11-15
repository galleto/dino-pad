import logging
from typing import Any, Dict, List, Optional
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from backend.config import settings
from backend.models import VitalReading, DeviceStatus

logger = logging.getLogger("dinopad.db")

_pool: Optional[ConnectionPool] = None
_db_available: bool = False

# Almacenamiento en memoria para modo degradado (si la BD no está disponible)
_memory_vitals: Dict[str, Dict[str, dict]] = {}  # crew_id -> indicator_id -> reading_dict
_memory_history: Dict[str, Dict[str, list]] = {}  # crew_id -> indicator_id -> list of readings
_memory_alerts: List[dict] = []
_memory_devices: Dict[str, dict] = {}


def init_db() -> bool:
    """Inicializa el pool de conexiones y crea las tablas e hipertablas si no existen."""
    global _pool, _db_available

    url = settings.effective_database_url
    if not url:
        logger.warning("[DB] No se configuró URL de base de datos (DATABASE_URL / TIMESCALE_SERVICE_URL). Activando modo degradado en memoria.")
        _db_available = False
        return False

    try:
        logger.info("[DB] Conectando a TimescaleDB...")
        _pool = ConnectionPool(
            conninfo=url,
            min_size=1,
            max_size=10,
            timeout=10.0,
            open=True,
            kwargs={"row_factory": dict_row},
        )

        with _pool.connection() as conn:
            with conn.cursor() as cur:
                # 1. Tabla vitals
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS vitals (
                        ts TIMESTAMPTZ NOT NULL,
                        crew_id VARCHAR(32) NOT NULL,
                        indicator_id VARCHAR(32) NOT NULL,
                        value DOUBLE PRECISION NULL,
                        unit VARCHAR(16) NOT NULL,
                        source VARCHAR(16) NOT NULL,
                        quality VARCHAR(16) NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_vitals_crew_ind_ts ON vitals (crew_id, indicator_id, ts DESC);
                """)

                # Intentar convertir en hypertable TimescaleDB
                try:
                    cur.execute("SELECT create_hypertable('vitals', 'ts', if_not_exists => TRUE);")
                    logger.info("[DB] Hipertabla 'vitals' verificada/creada exitosamente en TimescaleDB.")
                except Exception as ht_err:
                    conn.rollback()
                    logger.info("[DB] create_hypertable omitido (la tabla operará como estándar): %s", ht_err)

                # 2. Tabla alerts
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS alerts (
                        id UUID PRIMARY KEY,
                        ts TIMESTAMPTZ NOT NULL,
                        crew_id VARCHAR(32) NOT NULL,
                        indicator_id VARCHAR(32) NULL,
                        level VARCHAR(16) NOT NULL,
                        title VARCHAR(128) NOT NULL,
                        message TEXT NOT NULL,
                        action TEXT NOT NULL,
                        origin VARCHAR(16) NOT NULL,
                        ai_explanation TEXT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_alerts_crew_ts ON alerts (crew_id, ts DESC);
                """)

                # 3. Tabla device_status
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS device_status (
                        device_id VARCHAR(64) PRIMARY KEY,
                        crew_id VARCHAR(32) NOT NULL,
                        status VARCHAR(32) NOT NULL,
                        battery_pct INT NOT NULL,
                        rssi INT NOT NULL,
                        last_seen TIMESTAMPTZ NOT NULL
                    );
                """)

                conn.commit()

        _db_available = True
        logger.info("[DB] Tablas inicializadas exitosamente en TimescaleDB.")
        return True

    except Exception as e:
        logger.warning("[DB ERROR] Error al conectar o inicializar TimescaleDB: %s. Activando modo degradado en memoria.", e)
        _db_available = False
        if _pool:
            try:
                _pool.close()
            except Exception:
                pass
            _pool = None
        return False


def close_db():
    global _pool, _db_available
    if _pool:
        try:
            _pool.close()
            logger.info("[DB] Pool de conexiones cerrado.")
        except Exception as e:
            logger.error("[DB ERROR] Error al cerrar el pool: %s", e)
    _db_available = False


def is_db_connected() -> bool:
    return _db_available


def save_vital(reading: VitalReading) -> None:
    """Guarda una lectura en TimescaleDB (o en memoria en modo degradado)."""
    # Guardar siempre en memoria rápida
    crew_id = reading.crewId
    ind_id = reading.indicatorId
    r_dict = reading.model_dump()

    if crew_id not in _memory_vitals:
        _memory_vitals[crew_id] = {}
        _memory_history[crew_id] = {}
    _memory_vitals[crew_id][ind_id] = r_dict

    if ind_id not in _memory_history[crew_id]:
        _memory_history[crew_id][ind_id] = []
    _memory_history[crew_id][ind_id].append({
        "timestamp": reading.timestamp,
        "value": reading.value,
        "quality": reading.quality,
    })
    # Mantener máximo 500 registros en memoria
    if len(_memory_history[crew_id][ind_id]) > 500:
        _memory_history[crew_id][ind_id].pop(0)

    if not _db_available or not _pool:
        return

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO vitals (ts, crew_id, indicator_id, value, unit, source, quality)
                    VALUES (to_timestamp(%s / 1000.0), %s, %s, %s, %s, %s, %s);
                """, (
                    reading.timestamp,
                    reading.crewId,
                    reading.indicatorId,
                    reading.value,
                    reading.unit,
                    reading.source,
                    reading.quality,
                ))
                conn.commit()
    except Exception as e:
        logger.error("[DB ERROR] Error al guardar vital: %s", e)


def save_alert(alert_dict: dict) -> None:
    """Guarda una alerta en la tabla alerts."""
    # Guardar en memoria
    _memory_alerts.insert(0, alert_dict)
    if len(_memory_alerts) > 200:
        _memory_alerts.pop()

    if not _db_available or not _pool:
        return

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO alerts (id, ts, crew_id, indicator_id, level, title, message, action, origin, ai_explanation)
                    VALUES (%s, to_timestamp(%s / 1000.0), %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET ai_explanation = EXCLUDED.ai_explanation;
                """, (
                    alert_dict["id"],
                    alert_dict["timestamp"],
                    alert_dict["crewId"],
                    alert_dict.get("indicatorId"),
                    alert_dict["level"],
                    alert_dict["title"],
                    alert_dict["message"],
                    alert_dict["action"],
                    alert_dict.get("origin", "rule"),
                    alert_dict.get("aiExplanation"),
                ))
                conn.commit()
    except Exception as e:
        logger.error("[DB ERROR] Error al guardar alerta: %s", e)


def update_alert_ai(alert_id: str, ai_explanation: str) -> None:
    """Actualiza la explicación de IA de una alerta existente."""
    # Actualizar en memoria
    for a in _memory_alerts:
        if a["id"] == alert_id:
            a["aiExplanation"] = ai_explanation
            break

    if not _db_available or not _pool:
        return

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE alerts SET ai_explanation = %s WHERE id = %s;
                """, (ai_explanation, alert_id))
                conn.commit()
    except Exception as e:
        logger.error("[DB ERROR] Error al actualizar explicación de IA en alerta %s: %s", alert_id, e)


def save_device_status(status: DeviceStatus) -> None:
    """Guarda o actualiza el estado del dispositivo."""
    s_dict = status.model_dump()
    _memory_devices[status.deviceId] = s_dict

    if not _db_available or not _pool:
        return

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO device_status (device_id, crew_id, status, battery_pct, rssi, last_seen)
                    VALUES (%s, %s, %s, %s, %s, to_timestamp(%s / 1000.0))
                    ON CONFLICT (device_id) DO UPDATE SET
                        crew_id = EXCLUDED.crew_id,
                        status = EXCLUDED.status,
                        battery_pct = EXCLUDED.battery_pct,
                        rssi = EXCLUDED.rssi,
                        last_seen = EXCLUDED.last_seen;
                """, (
                    status.deviceId,
                    status.crewId,
                    status.status,
                    status.batteryPct,
                    status.rssi,
                    status.timestamp,
                ))
                conn.commit()
    except Exception as e:
        logger.error("[DB ERROR] Error al guardar estado de dispositivo: %s", e)


def get_latest_vitals(crew_id: str) -> Dict[str, Any]:
    """Obtiene la última lectura de cada indicador para un tripulante."""
    if not _db_available or not _pool:
        return _memory_vitals.get(crew_id, {})

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT ON (indicator_id)
                        indicator_id,
                        ROUND(EXTRACT(EPOCH FROM ts) * 1000)::bigint AS timestamp,
                        crew_id AS "crewId",
                        indicator_id AS "indicatorId",
                        value,
                        unit,
                        source,
                        quality
                    FROM vitals
                    WHERE crew_id = %s
                    ORDER BY indicator_id, ts DESC;
                """, (crew_id,))
                rows = cur.fetchall()
                result = {}
                for r in rows:
                    result[r["indicatorId"]] = dict(r)
                return result
    except Exception as e:
        logger.error("[DB ERROR] Error al consultar ultimos vitals: %s", e)
        return _memory_vitals.get(crew_id, {})


def get_vitals_history(crew_id: str, indicator_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Obtiene el historial de un indicador en orden cronológico ascendente."""
    if not _db_available or not _pool:
        hist = _memory_history.get(crew_id, {}).get(indicator_id, [])
        return hist[-limit:]

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        ROUND(EXTRACT(EPOCH FROM ts) * 1000)::bigint AS timestamp,
                        value,
                        quality
                    FROM (
                        SELECT ts, value, quality
                        FROM vitals
                        WHERE crew_id = %s AND indicator_id = %s
                        ORDER BY ts DESC
                        LIMIT %s
                    ) sub
                    ORDER BY ts ASC;
                """, (crew_id, indicator_id, limit))
                rows = cur.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        logger.error("[DB ERROR] Error al consultar historial de vitals: %s", e)
        hist = _memory_history.get(crew_id, {}).get(indicator_id, [])
        return hist[-limit:]


def get_alerts(crew_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Obtiene alertas recientes ordenadas por timestamp descendente."""
    if not _db_available or not _pool:
        filtered = [a for a in _memory_alerts if not crew_id or a["crewId"] == crew_id]
        return filtered[:limit]

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                if crew_id:
                    cur.execute("""
                        SELECT
                            id::text,
                            ROUND(EXTRACT(EPOCH FROM ts) * 1000)::bigint AS timestamp,
                            crew_id AS "crewId",
                            indicator_id AS "indicatorId",
                            level,
                            title,
                            message,
                            action,
                            origin,
                            ai_explanation AS "aiExplanation"
                        FROM alerts
                        WHERE crew_id = %s
                        ORDER BY ts DESC
                        LIMIT %s;
                    """, (crew_id, limit))
                else:
                    cur.execute("""
                        SELECT
                            id::text,
                            ROUND(EXTRACT(EPOCH FROM ts) * 1000)::bigint AS timestamp,
                            crew_id AS "crewId",
                            indicator_id AS "indicatorId",
                            level,
                            title,
                            message,
                            action,
                            origin,
                            ai_explanation AS "aiExplanation"
                        FROM alerts
                        ORDER BY ts DESC
                        LIMIT %s;
                    """, (limit,))
                rows = cur.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        logger.error("[DB ERROR] Error al consultar alertas: %s", e)
        filtered = [a for a in _memory_alerts if not crew_id or a["crewId"] == crew_id]
        return filtered[:limit]


def get_devices() -> List[Dict[str, Any]]:
    """Obtiene el estado de todos los dispositivos registrados."""
    if not _db_available or not _pool:
        return list(_memory_devices.values())

    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        device_id AS "deviceId",
                        crew_id AS "crewId",
                        status,
                        battery_pct AS "batteryPct",
                        rssi,
                        ROUND(EXTRACT(EPOCH FROM last_seen) * 1000)::bigint AS timestamp
                    FROM device_status
                    ORDER BY last_seen DESC;
                """)
                rows = cur.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        logger.error("[DB ERROR] Error al consultar estado de dispositivos: %s", e)
        return list(_memory_devices.values())
