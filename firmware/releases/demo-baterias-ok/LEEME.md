# dinopad_pipboy — demo-baterias-ok

Binarios de `dinopad_pipboy` tal como se grabaron en la placa `82:a4`
(`48:af:f3:67:82:a4`) el 15/11/2026 a la 01:00, para volver a subirlos sin recompilar.

- Código: tag `demo-baterias-ok` (commit `bb7a774`, rama `pines-botones`). El código
  del sketch y `pines.h` son idénticos a los de `a120241`, desde donde se compiló.
- Configuración: `ENVIAR_MENSAJE = false`, `DEMO_AUTOMATICO = true`, brownout
  activado (valor por defecto del core), sin Wi-Fi.
- Toolchain: arduino-cli, core `esp32:esp32` 3.3.12, FQBN `esp32:esp32:esp32`,
  `--libraries firmware/libraries`.
- Comprobado con `esptool verify-flash` contra la flash de la `82:a4`: los 4
  archivos coinciden (digest matched).

## Archivos

| Dirección | Archivo |
|---|---|
| `0x1000` | `bootloader.bin` |
| `0x8000` | `partitions.bin` |
| `0xe000` | `boot_app0.bin` |
| `0x10000` | `dinopad_pipboy.bin` |

Los `.bin` **no se versionan** (están en `firmware/.gitignore`): la aplicación
incluye código generado a partir de los `.proto` de Meshtastic (GPL-3.0), igual
que `src/mtpb/`. En git solo están este archivo y `SHA256SUMS`; los binarios
quedan en la carpeta local. Comprobar una copia con:

```sh
cd firmware/releases/demo-baterias-ok && sha256sum -c SHA256SUMS
```

## Grabar

```sh
ESPTOOL=$(ls -d ~/.arduino15/packages/esp32/tools/esptool_py/*/ | tail -1)esptool
cd firmware/releases/demo-baterias-ok
sha256sum -c SHA256SUMS
"$ESPTOOL" --chip esp32 --port /dev/ttyUSB0 --baud 115200 write-flash \
  --flash-mode dio --flash-freq 80m --flash-size 4MB \
  0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 dinopad_pipboy.bin
```

Antes de grabar, confirma la MAC con `"$ESPTOOL" --port /dev/ttyUSB0 read-mac`.
