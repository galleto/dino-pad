// DinoPadPage.jsx · "DINO PAD EN VIVO": gemelo digital del dispositivo.
// La pantalla (canvas 320x240) la dibuja dinopad/pantalla.js con la lógica de
// dinopad/maquina.js (portada del firmware). Solo presentación:
//  - BPM y SpO2 salen de las lecturas que ya tiene la web (REAL solo si source es "live").
//  - Estado, ambiente y nodos del tracker NO vienen en el contrato: aquí son DEMO
//    (ver docs/propuesta-espejo.md).
//  - El SOS del gemelo es una PRUEBA de pantalla; el SOS real solo sale por el flujo existente.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from '../hooks/useConnection';
import { Botones, Demo, estadoInicial, manejar, P, PESTANAS, SimuladorVital } from '../dinopad/maquina';
import { ALTO, ANCHO, dibujar, paginasTrack } from '../dinopad/pantalla';
import Origen from './Origen';
import { zonaStore } from './seleccion';
import '../styles/dinopad.css';

const TECLAS = { ArrowLeft: 'negro', ArrowRight: 'blanco', Enter: 'rojo', ' ': 'rojo' };

// Telemetría del tracker simulada en el navegador (DEMO): el contrato no la trae.
function crearTrackerDemo(ms) {
  const histAmb = [];
  for (let k = 30; k >= 0; k--) histAmb.push({ ms: ms - k * 60000, temp: 22.6 + 0.7 * Math.sin(k / 6), luz: 58 + 14 * Math.sin(k / 4 + 1) });
  return {
    msEstado: ms - 412000, rssi: -58, msRssi: ms, bateria: 87, voltaje: 4.02, usoCanal: 3.1, airTx: 0.4, uptime0: 11520,
    msMetricas: ms - 21000, nombreLargo: 'DinoPad T1000', nombreCorto: 'DINO', conexiones: 1,
    temperatura: histAmb.at(-1).temp, luz: histAmb.at(-1).luz, msAmbiente: ms - 9000, histAmb, msNodos: ms,
    nodos: [
      { corto: 'BASE', num: 'a1b2c3d4', saltos: 0, oidoS: 14 }, { corto: 'HAB1', num: '5e6f7a8b', saltos: 1, oidoS: 95 },
      { corto: 'ROVR', num: '0c9d8e7f', saltos: 1, oidoS: 240 }, { corto: 'REL2', num: '33aa41bc', saltos: 2, oidoS: 1300 },
      { corto: 'GW01', num: '7d21f0e5', saltos: '?', oidoS: 2600, mqtt: true }, { corto: 'LAB1', num: '19c4e6a2', saltos: 2, oidoS: 5200 },
      { corto: 'EVA3', num: 'b8073c11', saltos: 3, oidoS: 9100 },
    ],
  };
}

const INFO_PESTANA = [
  { que: 'Enlace BLE con el tracker, señal, batería, voltaje, uso del canal y tiempo encendido.', origen: 'En el dispositivo estos datos son reales (los lee del T1000-E). El contrato web no los trae: aquí son simulados.' },
  { que: 'Temperatura ambiente y luz medidas por el T1000-E, con su gráfica de 30 minutos.', origen: 'Es la temperatura del entorno, no la corporal: no se mezcla con el indicador "Temperatura". Aquí simulada.' },
  { que: 'Base Jezero y tripulantes con las coordenadas DEMO del firmware (posicion_demo.h), y la lista de nodos de la malla.', origen: 'El firmware usa estas coordenadas mientras el tracker no tenga GPS. La lista de nodos es simulada aquí.' },
  { que: 'Pulso (BPM) y oxigenación (SpO₂) con semáforo y gráfica de 2 minutos.', origen: 'El firmware los simula hasta que exista el sensor MAX30102. Aquí se muestran las lecturas que tiene la web.' },
  { que: 'Mensajes predeterminados para avisar sin escribir.', origen: 'El gemelo nunca envía nada. En el dispositivo el envío por radio está apagado por defecto.' },
];

function Cadena({ connectionState }) {
  const webActivo = connectionState === 'live';
  const eslabones = [
    { nodo: 'Sensor de pulso', sub: 'MAX30102 (previsto)', via: null, estado: 'pend', txt: 'Aún no instalado: el firmware simula BPM y SpO₂', tipo: 'demo' },
    { nodo: 'ESP32 · DINO PAD', sub: 'pantalla, 3 botones, menú', via: 'cable', estado: 'ok', txt: 'Firmware funcionando en el dispositivo', tipo: 'real' },
    { nodo: 'T1000-E', sub: 'tracker SenseCAP', via: 'BLE', estado: 'ok', txt: 'Lee batería, ambiente, posición y nodos del tracker', tipo: 'real' },
    { nodo: 'Malla LoRa', sub: 'Meshtastic', via: 'LoRa', estado: 'parcial', txt: 'Solo mensajes predeterminados, y el envío está apagado por defecto', tipo: 'real' },
    { nodo: 'Base', sub: 'backend', via: 'puente', estado: 'pend', txt: 'Pendiente: no hay puente de la malla al backend', tipo: null },
    { nodo: 'Esta web', sub: 'monitor de base', via: 'WebSocket', estado: webActivo ? 'ok' : 'pend', txt: webActivo ? 'Conectada al backend ahora' : 'Sin backend ahora: simulador local', tipo: webActivo ? 'real' : 'demo' },
  ];
  return (
    <section className="dp-cadena" aria-label="Cómo se crean los datos">
      <header className="col-head"><h2>¿Cómo se crean los datos?</h2><span>hoy el DINO PAD y la web no están conectados de punta a punta</span></header>
      <ol className="dp-eslabones">
        {eslabones.map((e) => (
          <li key={e.nodo} className={`dp-eslabon es-${e.estado}`}>
            {e.via && <span className="dp-via" aria-hidden="true"><i />{e.via}</span>}
            <div className="dp-nodo">
              <strong>{e.nodo}</strong><small>{e.sub}</small>
              <span className="dp-estado">{e.estado === 'ok' ? '● funciona' : e.estado === 'parcial' ? '◐ parcial' : '○ pendiente'}</span>
              <p>{e.txt}</p>
              {e.tipo && <Origen tipo={e.tipo} compact />}
            </div>
          </li>
        ))}
      </ol>
      <p className="dp-wifi"><strong>Camino Wi-Fi / MQTT:</strong> existe en otro firmware (<code>firmware/dinopad</code>) y el backend ya escucha MQTT, pero no está unido a este DINO PAD. <span className="dp-estado es-parcial">◐ parcial</span></p>
    </section>
  );
}

export default function DinoPadPage() {
  const data = useConnection();
  const canvasRef = useRef(null);
  const sim = useRef(null);
  const [ui, setUi] = useState(() => ({ ...estadoInicial(), pestana: ['hr', 'spo2'].includes(zonaStore.get()) ? P.VITAL : 0 }));
  const [presionado, setPresionado] = useState({ negro: false, blanco: false, rojo: false });
  const [demoAuto, setDemoAuto] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const fisico = useRef({ negro: false, blanco: false, rojo: false });
  const demoAutoRef = useRef(false);
  // Cada cambio de botón se guarda con su hora: así una pulsación corta no se pierde
  // aunque el navegador dibuje pocos cuadros por segundo.
  const cola = useRef([]);
  const poner = useCallback((cambios) => {
    fisico.current = { ...fisico.current, ...cambios };
    cola.current.push({ ...fisico.current, ms: performance.now() });
    setPresionado(fisico.current);
  }, []);
  const vitalRef = useRef({ simulado: true, hist: [] });

  // Lecturas de pulso y SpO2 que ya tiene la web, para la pestaña VITAL
  const crewId = data.activeCrewId;
  const hrHist = data.history[crewId]?.hr;
  const spo2Hist = data.history[crewId]?.spo2;
  const vitalWeb = useMemo(() => {
    const validas = (lista) => (lista || []).filter((r) => r?.quality !== 'no_signal' && r?.value != null && Number(r.timestamp) > 0).slice(-70);
    const hr = validas(hrHist);
    const spo2 = validas(spo2Hist);
    if (!hr.length || !spo2.length) return null;
    const muestras = hr.map((r) => {
      const par = spo2.reduce((mejor, c) => (Math.abs(c.timestamp - r.timestamp) < Math.abs(mejor.timestamp - r.timestamp) ? c : mejor), spo2[0]);
      return { t: Number(r.timestamp), hr: Math.round(r.value), spo2: Math.round(par.value) };
    });
    const ultima = hr.at(-1);
    return { muestras, real: ultima.source === 'live', ultimaT: Number(ultima.timestamp) };
  }, [hrHist, spo2Hist]);
  const enVivo = vitalWeb?.real && ahora - vitalWeb.ultimaT < 30000;

  useEffect(() => { demoAutoRef.current = demoAuto; }, [demoAuto]);
  useEffect(() => {
    const desfase = Date.now() - performance.now();   // de marca de tiempo a "millis" del gemelo
    vitalRef.current = vitalWeb ? { simulado: !vitalWeb.real, hist: vitalWeb.muestras.map((m) => ({ ms: m.t - desfase, hr: m.hr, spo2: m.spo2 })) } : null;
  }, [vitalWeb]);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Bucle del gemelo: botones -> eventos -> estado -> pantalla
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const t0 = performance.now();
    const botones = new Botones();
    const demo = new Demo();
    const simVital = new SimuladorVital();
    const propio = { simulado: true, hist: [] };
    const tracker = crearTrackerDemo(t0);
    let estado = { ...estadoInicial(), pestana: ['hr', 'spo2'].includes(zonaStore.get()) ? P.VITAL : 0 };
    let demoActivo = false;
    let ultimoDibujo = 0;
    let ultimoMinuto = t0;
    let sucio = true;
    let raf = 0;
    let previo = { negro: false, blanco: false, rojo: false };
    sim.current = { reiniciar() { estado = estadoInicial(); sucio = true; setUi(estado); } };

    const aplicar = (evento, desdeDemo) => {
      const previo = estado;
      estado = manejar(estado, evento, desdeDemo);
      if (estado.pestana === P.TRACK) estado.paginaTrack = Math.min(estado.paginaTrack, paginasTrack(tracker.nodos.length) - 1);
      // Vínculo con la figura humana: entrar a VITAL selecciona el corazón
      if (estado.modo === 'DENTRO' && estado.pestana === P.VITAL && previo.modo !== 'DENTRO') zonaStore.set('hr');
      sucio = true;
      setUi(estado);
    };

    const cuadro = (ms) => {
      raf = requestAnimationFrame(cuadro);
      while (cola.current.length) {
        const c = cola.current.shift();
        botones.actualizar(previo.negro, previo.blanco, previo.rojo, c.ms);   // asienta lo anterior
        botones.actualizar(c.negro, c.blanco, c.rojo, c.ms);
        previo = c;
      }
      botones.actualizar(previo.negro, previo.blanco, previo.rojo, Math.max(ms, previo.ms || 0));
      for (let e; (e = botones.siguienteEvento());) aplicar(e, false);
      if (demoAutoRef.current !== demoActivo) { demoActivo = demoAutoRef.current; if (demoActivo) demo.empezarEn(ms + 1500); sucio = true; }
      if (demoActivo) { const e = demo.siguiente(ms); if (e) aplicar(e, true); }
      const m = simVital.leer(ms);
      if (m) { propio.hist.push(m); if (propio.hist.length > 60) propio.hist.shift(); }
      if (ms - ultimoMinuto >= 60000) {   // el tracker DEMO "mide" una vez por minuto
        ultimoMinuto = ms;
        tracker.temperatura = 22.6 + 0.7 * Math.sin(ms / 360000);
        tracker.luz = 58 + 14 * Math.sin(ms / 240000 + 1);
        tracker.histAmb.push({ ms, temp: tracker.temperatura, luz: tracker.luz });
        tracker.msAmbiente = ms;
        tracker.msMetricas = ms;
      }
      if (ms - tracker.msRssi >= 5000) { tracker.msRssi = ms; tracker.rssi = -58 + Math.round(3 * Math.sin(ms / 7000)); }
      tracker.uptime = tracker.uptime0 + (ms - t0) / 1000;
      const sos = estado.modo === 'SOS' ? -1 : botones.progresoSos(ms);
      if (sucio || sos >= 0 || ms - ultimoDibujo >= 250) {
        dibujar(ctx, estado, { tracker, vital: vitalRef.current || propio }, { ms, demoAuto: demoActivo, sosProgreso: sos });
        ultimoDibujo = ms;
        sucio = sos >= 0;   // un cuadro más al soltar, para borrar la barra
      }
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Teclado: ← NEGRO, → BLANCO, Enter o espacio ROJO
  useEffect(() => {
    const abajo = (e) => {
      const boton = TECLAS[e.key];
      if (!boton || e.repeat || /^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(e.target.tagName)) return;
      e.preventDefault();
      poner({ [boton]: true });
    };
    const arriba = (e) => { const boton = TECLAS[e.key]; if (boton) poner({ [boton]: false }); };
    const soltarTodo = () => poner({ negro: false, blanco: false, rojo: false });
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    window.addEventListener('blur', soltarTodo);
    return () => { window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba); window.removeEventListener('blur', soltarTodo); };
  }, [poner]);

  const boton = (id, nombre, tecla) => (
    <button type="button" className={`dp-boton dp-${id}${presionado[id] ? ' is-down' : ''}`} aria-label={`Botón ${nombre}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); poner({ [id]: true }); }}
      onPointerUp={() => poner({ [id]: false })} onPointerCancel={() => poner({ [id]: false })}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); poner({ [id]: true }); } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') poner({ [id]: false }); }}>
      <i aria-hidden="true" /><span>{nombre}</span><kbd>{tecla}</kbd>
    </button>
  );
  const info = INFO_PESTANA[ui.pestana];
  const vitalReal = ui.pestana === P.VITAL && vitalWeb?.real;

  return (
    <div className="dp-pagina">
      <div className="dp-escena">
        <div className="dp-equipo-sombra">
          <div className="dp-equipo">
            <div className="dp-rotulo"><strong>DINO PAD</strong><span>ESP32 · TFT 320×240 · Dinobotics TecNM</span><i className="dp-led" aria-hidden="true" /></div>
            <div className="dp-bisel">
              <canvas ref={canvasRef} width={ANCHO} height={ALTO} className="dp-pantalla" role="img"
                aria-label={ui.modo === 'SOS' ? 'Pantalla del DINO PAD: SOS de prueba, no se envía nada' : `Pantalla del DINO PAD: pestaña ${PESTANAS[ui.pestana]}, ${ui.modo === 'DENTRO' ? 'dentro' : 'en el menú'}. Último evento: ${ui.pie}`} />
            </div>
            <div className="dp-botonera">
              {boton('negro', 'NEGRO', '←')}
              {boton('blanco', 'BLANCO', '→')}
              {boton('rojo', 'ROJO', 'Enter')}
            </div>
          </div>
        </div>

        <div className="dp-lado">
          <div className={`dp-insignia${enVivo ? ' is-vivo' : ''}`} role="status">
            {enVivo
              ? <><strong>EN VIVO desde el DINO PAD</strong><span>hace {Math.max(0, Math.round((ahora - vitalWeb.ultimaT) / 1000))} s</span></>
              : <><strong>SIMULADO</strong><span>no llegan mensajes reales del dispositivo; todo lo que ves aquí es DEMO</span></>}
          </div>
          {demoAuto && <p className="dp-demo-auto">DEMO AUTO: el menú se recorre solo, con el mismo guion que el firmware.</p>}

          <section className="dp-bloque">
            <header className="col-head"><h2>{PESTANAS[ui.pestana]} <small>{ui.modo === 'SOS' ? 'SOS de prueba' : ui.modo === 'DENTRO' ? 'dentro de la pestaña' : 'en el menú'}</small></h2><Origen tipo={vitalReal ? 'real' : 'demo'} compact /></header>
            <p>{info.que}</p>
            <p className="dp-nota">{info.origen}</p>
            {ui.pestana === P.VITAL && <p className="dp-nota"><a href="#/monitoreo" onClick={() => zonaStore.set('hr')}>Ver el corazón en la figura humana</a></p>}
          </section>

          <section className="dp-bloque">
            <header className="col-head"><h2>Controles</h2></header>
            <dl className="dp-controles">
              <div><dt><kbd>←</kbd> NEGRO</dt><dd>anterior</dd></div>
              <div><dt><kbd>→</kbd> BLANCO</dt><dd>siguiente</dd></div>
              <div><dt><kbd>Enter</kbd> ROJO</dt><dd>seleccionar; mantenlo para volver</dd></div>
              <div><dt>NEGRO + BLANCO</dt><dd>3 segundos: SOS de prueba</dd></div>
            </dl>
            <div className="dp-acciones">
              <button type="button" className={`button${demoAuto ? ' button-primary' : ''}`} aria-pressed={demoAuto} onClick={() => setDemoAuto((v) => !v)}>{demoAuto ? 'Detener DEMO AUTO' : 'Iniciar DEMO AUTO'}</button>
              <button type="button" className="button button-danger" onPointerDown={() => poner({ negro: true, blanco: true })} onPointerUp={(e) => { poner({ negro: false, blanco: false }); e.currentTarget.blur(); }} onPointerLeave={() => poner({ negro: false, blanco: false })} onPointerCancel={() => poner({ negro: false, blanco: false })}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) poner({ negro: true, blanco: true }); }} onKeyUp={() => poner({ negro: false, blanco: false })}>Mantener NEGRO + BLANCO</button>
              <button type="button" className="button" onClick={() => sim.current?.reiniciar()}>Reiniciar</button>
            </div>
            <p className="dp-nota">El SOS del gemelo solo cambia esta pantalla. El SOS real llega por las alertas del backend y se atiende en Emergencia.</p>
          </section>
        </div>
      </div>
      <Cadena connectionState={data.connectionState} />
    </div>
  );
}
