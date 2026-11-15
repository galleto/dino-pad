import asyncio
import logging

logger = logging.getLogger("mock_broker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [BROKER] %(message)s", datefmt="%H:%M:%S")


class MiniMQTTBroker:
    """Broker MQTT 3.1.1 minimo en asyncio para pruebas locales sin dependencias externas."""

    def __init__(self, host: str = "127.0.0.1", port: int = 1883):
        self.host = host
        self.port = port
        self.subscribers = {}  # {writer: set of topics}

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.subscribers[writer] = set()
        addr = writer.get_extra_info("peername")
        logger.info("Cliente conectado desde %s", addr)

        try:
            while True:
                header = await reader.read(1)
                if not header:
                    break

                byte0 = header[0]
                pkt_type = byte0 >> 4

                # Decodificar longitud restante (variable length)
                multiplier = 1
                rem_len = 0
                while True:
                    b = await reader.read(1)
                    if not b:
                        break
                    digit = b[0]
                    rem_len += (digit & 127) * multiplier
                    multiplier *= 128
                    if (digit & 128) == 0:
                        break

                payload = await reader.readexactly(rem_len) if rem_len > 0 else b""

                if pkt_type == 1:  # CONNECT
                    proto_level = 4
                    if len(payload) >= 7 and payload[1:5] == b"MQTT":
                        proto_level = payload[6]

                    if proto_level == 5:
                        writer.write(bytes([0x20, 0x03, 0x00, 0x00, 0x00]))
                    else:
                        writer.write(bytes([0x20, 0x02, 0x00, 0x00]))
                    await writer.drain()

                elif pkt_type == 8:  # SUBSCRIBE
                    if len(payload) >= 2:
                        pkt_id = payload[:2]
                        self.subscribers[writer].add("#")
                        writer.write(bytes([0x90, 0x03, pkt_id[0], pkt_id[1], 0x00]))
                        await writer.drain()

                elif pkt_type == 3:  # PUBLISH
                    raw_packet = header + self._encode_length(rem_len) + payload
                    for sub_w in list(self.subscribers.keys()):
                        if sub_w != writer and not sub_w.is_closing():
                            try:
                                sub_w.write(raw_packet)
                                await sub_w.drain()
                            except Exception:
                                pass

                elif pkt_type == 12:  # PINGREQ
                    writer.write(bytes([0xD0, 0x00]))
                    await writer.drain()

                elif pkt_type == 14:  # DISCONNECT
                    break

        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        finally:
            logger.info("Cliente desconectado: %s", addr)
            self.subscribers.pop(writer, None)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    @staticmethod
    def _encode_length(length: int) -> bytes:
        encoded = bytearray()
        while True:
            digit = length % 128
            length //= 128
            if length > 0:
                digit |= 0x80
            encoded.append(digit)
            if length == 0:
                break
        return bytes(encoded)

    async def start(self):
        server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logger.info("Mini Broker MQTT escuchando en %s:%s", self.host, self.port)
        async with server:
            await server.serve_forever()


if __name__ == "__main__":
    broker = MiniMQTTBroker()
    try:
        asyncio.run(broker.start())
    except KeyboardInterrupt:
        print("\nBroker detenido.")
