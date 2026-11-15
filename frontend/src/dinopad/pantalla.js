// pantalla.js · Dibuja la pantalla de 320x240 del DINO PAD en un canvas, píxel a píxel,
// siguiendo firmware/dinopad_pipboy/ui.cpp (rama pines-botones): mismas coordenadas,
// textos y colores. La fuente es la clásica de 5x7 de Adafruit GFX (licencia BSD),
// transcrita aquí; cada carácter ocupa 6x8 px por tamaño.
import { aGrados, clasificar, desplazamiento, distanciaM, MENSAJES, P, PESTANAS, POSDEMO, RANGO_HR, RANGO_SPO2, rumbo } from './maquina';

export const ANCHO = 320;
export const ALTO = 240;

// RGB565 de ui.cpp convertido a RGB888
export const COL = {
  FONDO: '#000000', VERDE: '#00ff00', VERDE_OSC: '#004900', VERDE_MED: '#007d00',
  ROJO: '#ff0000', BLANCO: '#ffffff', AMARILLO: '#ffff00', GRIS: '#848284', NEGRO: '#000000',
};

const FUENTE = '0000000000' + '00005f0000' + '0007000700' + '147f147f14' + '242a7f2a12' + '2313086462' + '3649562050' + '0008070300'
  + '001c224100' + '0041221c00' + '2a1c7f1c2a' + '08083e0808' + '0080703000' + '0808080808' + '0000606000' + '2010080402'
  + '3e5149453e' + '00427f4000' + '7249494946' + '2141494d33' + '1814127f10' + '2745454539' + '3c4a494931' + '4121110907'
  + '3649494936' + '464949291e' + '0000140000' + '0040340000' + '0008142241' + '1414141414' + '0041221408' + '0201590906'
  + '3e415d594e' + '7c1211127c' + '7f49494936' + '3e41414122' + '7f4141413e' + '7f49494941' + '7f09090901' + '3e41415173'
  + '7f0808087f' + '00417f4100' + '2040413f01' + '7f08142241' + '7f40404040' + '7f021c027f' + '7f0408107f' + '3e4141413e'
  + '7f09090906' + '3e4151215e' + '7f09192946' + '2649494932' + '03017f0103' + '3f4040403f' + '1f2040201f' + '3f4038403f'
  + '6314081463' + '0304780403' + '6159494d43' + '007f414141' + '0204081020' + '004141417f' + '0402010204' + '4040404040'
  + '0003070800' + '2054547840' + '7f28444438' + '3844444428' + '384444287f' + '3854545418' + '00087e0902' + '18a4a49c78'
  + '7f08040478' + '00447d4000' + '2040403d00' + '7f10284400' + '00417f4000' + '7c04780478' + '7c08040478' + '3844444438'
  + 'fc18242418' + '18242418fc' + '7c08040408' + '4854545424' + '04043f4424' + '3c4040207c' + '1c2040201c' + '3c4030403c'
  + '4428102844' + '4c9090907c' + '4464544c44' + '0008364100' + '0000770000' + '0041360800' + '0201020402';
const GLIFOS = [];
for (let i = 0; i < FUENTE.length; i += 10) GLIFOS.push([0, 2, 4, 6, 8].map((k) => parseInt(FUENTE.slice(i + k, i + k + 2), 16)));

function crearGfx(ctx) {
  const rect = (x, y, w, h, c) => { if (w > 0 && h > 0) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); } };
  const g = {
    fillRect: rect,
    drawRect(x, y, w, h, c) { rect(x, y, w, 1, c); rect(x, y + h - 1, w, 1, c); rect(x, y, 1, h, c); rect(x + w - 1, y, 1, h, c); },
    hline(x, y, w, c) { rect(x, y, w, 1, c); },
    pixel(x, y, c) { rect(x, y, 1, 1, c); },
    line(x0, y0, x1, y1, c) {   // Bresenham, sin suavizado
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      ctx.fillStyle = c;
      for (;;) {
        ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    // Texto con fondo (como setTextColor(color, fondo) de GFX)
    text(s, x, y, tam, c, fondo) {
      const str = String(s);
      if (fondo) rect(x, y, str.length * 6 * tam, 8 * tam, fondo);
      ctx.fillStyle = c;
      for (let i = 0; i < str.length; i++) {
        const cols = GLIFOS[str.charCodeAt(i) - 32];
        if (!cols) continue;
        for (let cx = 0; cx < 5; cx++) {
          for (let cy = 0; cy < 8; cy++) {
            if (cols[cx] & (1 << cy)) ctx.fillRect(x + (i * 6 + cx) * tam, y + cy * tam, tam, tam);
          }
        }
      }
    },
    // campo(): texto rellenado hasta 'ancho' caracteres
    campo(x, y, tam, c, ancho, s, fondo = COL.FONDO) { g.text(String(s).slice(0, ancho).padEnd(ancho), x, y, tam, c, fondo); },
    centrado(s, y, tam, c, fondo) { g.text(s, (ANCHO - s.length * 6 * tam) / 2, y, tam, c, fondo); },
  };
  return g;
}

const Y_PESTANAS = 26;
const ALTO_PESTANA = 22;
const ANCHO_PEST = ANCHO / PESTANAS.length;
const Y_CONT = 54;
const ALTO_CONT = 142;
const Y_SOS_BARRA = 200;
const Y_PIE = 216;

function edad(s) {
  if (s == null) return '--';
  if (s < 100) return `${Math.floor(s)}s`;
  if (s < 6000) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
const semaforo = (s) => (s === 'NORMAL' ? COL.VERDE : s === 'ATENCION' ? COL.AMARILLO : COL.ROJO);

function estado(g, d, ms) {
  ['CONEXION', 'RSSI', 'BATERIA', 'VOLTAJE', 'CANAL', 'UPTIME'].forEach((t, i) => g.text(t, 10, Y_CONT + 10 + i * 20, 1, COL.GRIS, COL.FONDO));
  const fila = (i, valor, color, e) => { const y = Y_CONT + 6 + i * 20; g.campo(90, y, 2, color, 14, valor); g.campo(270, y + 4, 1, COL.GRIS, 7, e); };
  const em = edad((ms - d.msMetricas) / 1000);
  fila(0, 'CONECTADO', COL.VERDE, edad((ms - d.msEstado) / 1000));
  fila(1, `${d.rssi} dBm`, d.rssi >= -70 ? COL.VERDE : d.rssi >= -85 ? COL.AMARILLO : COL.ROJO, edad((ms - d.msRssi) / 1000));
  fila(2, `${d.bateria} %`, d.bateria >= 50 ? COL.VERDE : d.bateria >= 20 ? COL.AMARILLO : COL.ROJO, em);
  fila(3, `${d.voltaje.toFixed(2)} V`, d.voltaje >= 3.8 ? COL.VERDE : d.voltaje >= 3.6 ? COL.AMARILLO : COL.ROJO, em);
  fila(4, `${d.usoCanal.toFixed(1)}% tx${d.airTx.toFixed(1)}%`, d.usoCanal < 25 ? COL.VERDE : d.usoCanal < 50 ? COL.AMARILLO : COL.ROJO, em);
  const up = Math.floor(d.uptime);
  fila(5, up >= 86400 ? `${Math.floor(up / 86400)}d ${Math.floor(up / 3600) % 24}h` : `${Math.floor(up / 3600)}h ${String(Math.floor(up / 60) % 60).padStart(2, '0')}m`, COL.BLANCO, em);
  g.campo(10, Y_CONT + 128, 1, COL.VERDE_MED, 27, `${d.nombreLargo.slice(0, 12)} (${d.nombreCorto}) con:${d.conexiones}`);
}

function grafica(g, x, y, w, h, muestras, clave, esLuz, ms, color) {
  g.fillRect(x + 1, y + 1, w - 2, h - 2, COL.FONDO);
  g.drawRect(x, y, w, h, COL.VERDE_OSC);
  const VENTANA = 30 * 60 * 1000;
  const vis = muestras.filter((m) => ms - m.ms <= VENTANA && m.ms <= ms + 60000);
  if (!vis.length) { g.text('sin dato', x + (w - 48) / 2, y + h / 2 - 4, 1, COL.GRIS, COL.FONDO); return; }
  let vmin = Math.min(...vis.map((m) => m[clave]));
  let vmax = Math.max(...vis.map((m) => m[clave]));
  if (esLuz) { vmin = 0; vmax = 100; } else if (vmax - vmin < 2) { const mid = (vmax + vmin) / 2; vmin = mid - 1; vmax = mid + 1; }
  g.text(vmax.toFixed(esLuz ? 0 : 1), x + 3, y + 3, 1, COL.VERDE_MED, COL.FONDO);
  g.text(vmin.toFixed(esLuz ? 0 : 1), x + 3, y + h - 10, 1, COL.VERDE_MED, COL.FONDO);
  let prev = null;
  vis.forEach((m) => {
    const atras = Math.max(0, ms - m.ms);
    const px = x + w - 3 - Math.trunc(((w - 6) * atras) / VENTANA);
    const py = y + h - 3 - Math.trunc(((h - 6) * (m[clave] - vmin)) / (vmax - vmin));
    if (prev && m.ms - prev.ms <= 5 * 60 * 1000) g.line(prev.px, prev.py, px, py, color);
    g.fillRect(px - 1, py - 1, 3, 3, color);
    prev = { px, py, ms: m.ms };
  });
}

function ambiente(g, d, ms) {
  g.text('TEMP AMBIENTE', 6, Y_CONT + 5, 1, COL.GRIS, COL.FONDO);
  g.text('LUZ (0-100)', 164, Y_CONT + 5, 1, COL.GRIS, COL.FONDO);
  g.text('30min', 104, Y_CONT + 5, 1, COL.VERDE_OSC, COL.FONDO);
  g.text('30min', 262, Y_CONT + 5, 1, COL.VERDE_OSC, COL.FONDO);
  const e = edad((ms - d.msAmbiente) / 1000);
  const yV = Y_CONT + 18;
  g.campo(6, yV, 2, COL.AMARILLO, 8, `${d.temperatura.toFixed(1)} C`);
  g.campo(116, yV + 4, 1, COL.GRIS, 6, e);
  g.campo(164, yV, 2, COL.BLANCO, 8, `${d.luz.toFixed(0)} /100`);
  g.campo(274, yV + 4, 1, COL.GRIS, 6, e);
  const yG = Y_CONT + 40;
  grafica(g, 6, yG, 150, ALTO_CONT - 44, d.histAmb, 'temp', false, ms, COL.AMARILLO);
  grafica(g, 164, yG, 150, ALTO_CONT - 44, d.histAmb, 'luz', true, ms, COL.BLANCO);
}

const FILAS_TRACK = 8;
export function paginasTrack(nNodos) {
  const f = FILAS_TRACK - POSDEMO.TRIPULANTES.length;
  return nNodos ? Math.ceil(nNodos / f) : 1;
}

function track(g, d, ms, pagina) {
  g.hline(6, Y_CONT + 47, ANCHO - 12, COL.VERDE_OSC);
  g.text('NOMB ID         SALTOS  OIDO', 8, Y_CONT + 52, 1, COL.GRIS, COL.FONDO);
  // Sin fix de GPS: coordenadas DEMO de posicion_demo.h
  g.campo(8, Y_CONT + 5, 1, COL.GRIS, 19, POSDEMO.NOMBRE_BASE);
  g.campo(128, Y_CONT + 5, 1, COL.NEGRO, 4, 'DEMO', COL.AMARILLO);
  g.campo(8, Y_CONT + 17, 2, COL.AMARILLO, 21, `${POSDEMO.BASE_LAT.toFixed(5)} ${POSDEMO.BASE_LON.toFixed(5)}`);
  g.campo(270, Y_CONT + 5, 1, COL.GRIS, 7, 'fija');
  g.campo(8, Y_CONT + 36, 1, COL.VERDE_MED, 27, 'GPS sin fix: usando DEMO');
  const paginas = paginasTrack(d.nodos.length);
  const pag = Math.min(pagina, paginas - 1);
  g.campo(200, Y_CONT + 52, 1, COL.VERDE_MED, 18, `${d.nodos.length} nodos  ${pag + 1}/${paginas}`);
  const filaY = (i) => Y_CONT + 64 + i * 10;
  const s = Math.floor(ms / 1000);
  POSDEMO.TRIPULANTES.forEach((t, i) => {
    const { norte, este } = desplazamiento(i, s);
    const { lat, lon } = aGrados(norte, este);
    g.campo(8, filaY(i), 1, COL.AMARILLO, 50, `${t.corto.padEnd(4)} ${lat.toFixed(5)} ${lon.toFixed(5)} ${distanciaM(norte, este).toFixed(0).padStart(4)}m ${rumbo(norte, este).padEnd(2)} DEMO`);
  });
  const f0 = POSDEMO.TRIPULANTES.length;
  const porPagina = FILAS_TRACK - f0;
  for (let i = f0; i < FILAS_TRACK; i++) {
    const n = d.nodos[pag * porPagina + (i - f0)];
    if (!n) continue;
    const color = n.oidoS < 900 ? COL.VERDE : n.oidoS < 7200 ? COL.VERDE_MED : COL.GRIS;
    g.campo(8, filaY(i), 1, color, 50, `${n.corto.padEnd(4)} !${n.num}  ${String(n.saltos).padEnd(6)}  ${edad(n.oidoS + (ms - d.msNodos) / 1000).padEnd(5)}${n.mqtt ? ' MQTT' : ''}`);
  }
}

function graficaVital(g, x, y, w, h, hist, clave, r, vmin, vmax, ms) {
  g.fillRect(x + 1, y + 1, w - 2, h - 2, COL.FONDO);
  g.drawRect(x, y, w, h, COL.VERDE_OSC);
  const yDe = (v) => y + h - 3 - Math.trunc(((h - 6) * (Math.min(vmax, Math.max(vmin, v)) - vmin)) / (vmax - vmin));
  [r.okMin, r.okMax].forEach((lim) => {
    if (lim <= vmin || lim >= vmax) return;
    for (let px = x + 2; px < x + w - 2; px += 4) g.pixel(px, yDe(lim), COL.VERDE_MED);
  });
  g.text(String(vmax), x + 3, y + 3, 1, COL.VERDE_MED, COL.FONDO);
  g.text(String(vmin), x + 3, y + h - 10, 1, COL.VERDE_MED, COL.FONDO);
  let prev = null;
  hist.forEach((m) => {
    const atras = ms - m.ms;
    if (atras > 120000 || atras < 0) return;
    const px = x + w - 3 - Math.trunc(((w - 6) * atras) / 120000);
    const py = yDe(m[clave]);
    if (prev) g.line(prev.px, prev.py, px, py, semaforo(clasificar(m[clave], r)));
    prev = { px, py };
  });
}

function vital(g, v, ms) {
  g.text('BPM', 6, Y_CONT + 5, 1, COL.GRIS, COL.FONDO);
  g.text('SpO2', 164, Y_CONT + 5, 1, COL.GRIS, COL.FONDO);
  g.text('lpm', 60, Y_CONT + 30, 1, COL.VERDE_OSC, COL.FONDO);
  g.text('%', 218, Y_CONT + 30, 1, COL.VERDE_OSC, COL.FONDO);
  g.text('2min', 134, Y_CONT + 5, 1, COL.VERDE_OSC, COL.FONDO);
  g.text('2min', 292, Y_CONT + 5, 1, COL.VERDE_OSC, COL.FONDO);
  if (v.simulado) {   // aviso de datos simulados, como en el firmware
    g.campo(100, Y_CONT + 5, 1, COL.NEGRO, 4, 'DEMO', COL.AMARILLO);
    g.campo(258, Y_CONT + 5, 1, COL.NEGRO, 4, 'DEMO', COL.AMARILLO);
  }
  const m = v.hist.at(-1);
  if (!m) {
    g.campo(6, Y_CONT + 16, 3, COL.GRIS, 3, '--');
    g.campo(164, Y_CONT + 16, 3, COL.GRIS, 3, '--');
    g.campo(90, Y_CONT + 22, 1, COL.GRIS, 8, 'sin dato');
    g.campo(248, Y_CONT + 22, 1, COL.GRIS, 8, 'sin dato');
    return;
  }
  const sh = clasificar(m.hr, RANGO_HR);
  const ss = clasificar(m.spo2, RANGO_SPO2);
  g.campo(6, Y_CONT + 16, 3, semaforo(sh), 3, m.hr);
  g.campo(90, Y_CONT + 22, 1, semaforo(sh), 8, sh);
  g.campo(164, Y_CONT + 16, 3, semaforo(ss), 3, m.spo2);
  g.campo(248, Y_CONT + 22, 1, semaforo(ss), 8, ss);
  const yG = Y_CONT + 44;
  graficaVital(g, 6, yG, 150, ALTO_CONT - 48, v.hist, 'hr', RANGO_HR, 40, 120, ms);
  graficaVital(g, 164, yG, 150, ALTO_CONT - 48, v.hist, 'spo2', RANGO_SPO2, 85, 100, ms);
}

function mens(g, dentro, cursor) {
  MENSAJES.forEach((t, i) => {
    const sel = dentro && i === cursor;
    g.campo(8, Y_CONT + 6 + i * 16, 2, sel ? COL.NEGRO : COL.VERDE, 25, `${sel ? '>' : ' '}${t}`, sel ? COL.VERDE : COL.FONDO);
  });
}

// Dibuja un cuadro completo. e: estado de la máquina; datos: { tracker, vital }; opciones del gemelo.
export function dibujar(ctx, e, datos, { ms, demoAuto, sosProgreso }) {
  const g = crearGfx(ctx);
  if (e.modo === 'SOS') {   // pantallaSos(): solo PRUEBA, no envía nada
    g.fillRect(0, 0, ANCHO, ALTO, COL.ROJO);
    g.centrado('SOS', 50, 8, COL.BLANCO);
    g.centrado('PRUEBA: no se envia nada', 140, 2, COL.BLANCO);
    g.centrado('ROJO: cerrar', 180, 2, COL.BLANCO);
    return;
  }
  g.fillRect(0, 0, ANCHO, ALTO, COL.FONDO);
  const dentro = e.modo === 'DENTRO';
  // titulo()
  g.fillRect(0, 0, ANCHO, 22, COL.VERDE_OSC);
  g.hline(0, 22, ANCHO, COL.VERDE);
  g.text('DINOPAD', 6, 4, 2, COL.VERDE);
  g.text(dentro ? 'DENTRO' : 'MENU', 104, 8, 1, COL.VERDE);
  if (demoAuto) { g.fillRect(150, 5, 58, 13, COL.AMARILLO); g.text('DEMO AUTO', 152, 8, 1, COL.NEGRO); }
  g.campo(262, 8, 1, COL.VERDE, 9, 'BLE OK', COL.VERDE_OSC);
  // pestanas()
  PESTANAS.forEach((nombre, i) => {
    const x = i * ANCHO_PEST;
    const s = i === e.pestana;
    g.fillRect(x, Y_PESTANAS, ANCHO_PEST, ALTO_PESTANA, s ? COL.VERDE : COL.FONDO);
    g.drawRect(x, Y_PESTANAS, ANCHO_PEST, ALTO_PESTANA, COL.VERDE_MED);
    const tam = nombre.length <= 5 ? 2 : 1;
    g.text(nombre, x + (ANCHO_PEST - nombre.length * 6 * tam) / 2, Y_PESTANAS + (tam === 2 ? 4 : 8), tam, s ? COL.FONDO : COL.VERDE);
  });
  // marcoContenido()
  g.drawRect(2, Y_CONT, ANCHO - 4, ALTO_CONT, dentro ? COL.VERDE : COL.VERDE_OSC);
  if (dentro) g.drawRect(3, Y_CONT + 1, ANCHO - 6, ALTO_CONT - 2, COL.VERDE);
  if (e.pestana === P.ESTADO) estado(g, datos.tracker, ms);
  else if (e.pestana === P.AMBIENTE) ambiente(g, datos.tracker, ms);
  else if (e.pestana === P.TRACK) track(g, datos.tracker, ms, e.paginaTrack);
  else if (e.pestana === P.VITAL) vital(g, datos.vital, ms);
  else mens(g, dentro, e.cursorMens);
  // barraSos()
  if (sosProgreso >= 0) {
    const w = Math.trunc((ANCHO - 12) * sosProgreso);
    g.fillRect(0, Y_SOS_BARRA, ANCHO, 12, COL.FONDO);
    g.drawRect(4, Y_SOS_BARRA, ANCHO - 8, 11, COL.ROJO);
    g.fillRect(6, Y_SOS_BARRA + 2, w, 7, COL.ROJO);
  }
  // pie()
  g.hline(0, Y_PIE - 3, ANCHO, COL.VERDE_OSC);
  g.text(e.eventoDeDemo ? `Ultimo DEMO: ${e.pie.slice(0, 37)}` : `Ultimo: ${e.pie.slice(0, 42)}`, 6, Y_PIE, 1, COL.AMARILLO);
  g.text('NEG:<  BLA:>  ROJO:ok/largo volver  NEG+BLA 3s:SOS', 6, Y_PIE + 12, 1, COL.VERDE_MED);
}
