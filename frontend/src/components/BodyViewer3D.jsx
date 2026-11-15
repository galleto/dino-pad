// BodyViewer3D.jsx · Figura humana 3D (three.js): un cuerpo volumétrico hecho de anillos
// horizontales, como un escaneo por capas, con los órganos dentro. Gira sola, se puede
// arrastrar y cada zona toma el color del semáforo de su indicador. Los rótulos laterales
// son botones (sirven con teclado) y una línea los une a su órgano mientras el cuerpo gira.
// Se carga con import dinámico; si no hay WebGL avisa con onFallo y se usa la figura 2D.
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3 } from 'three';
import { getStatus, STATUS_LABEL } from '../services/health';
import { CX, partesEn } from './cuerpo';
import './BodyViewer3D.css';

const COLOR = { ok: '#a4ff70', warn: '#ffc66d', crit: '#ff6b63', nodata: '#84958a', ref: '#78c9d4' };
const GLIFO = { ok: '●', warn: '▲', crit: '■', nodata: '○' };
const X = (x) => (x - CX) / 100;
const Y = (y) => (318 - y) / 100;

// Zonas: posición del ancla (para la línea guía), lado y altura del rótulo, y sus piezas.
// pieza: [tipo, posición, escala]; tipos: esfera, aro (manguito), capsula.
const ZONAS = [
  { id: 'sleep', nombre: 'Sueño', lado: 'izq', top: 5, pos: [-0.1, 2.7, 0.04], piezas: [['esfera', [-0.1, 2.7, 0.02], [0.15, 0.15, 0.24]]] },
  { id: 'mood', nombre: 'Ánimo', lado: 'der', top: 5, pos: [0.1, 2.7, 0.04], piezas: [['esfera', [0.1, 2.7, 0.02], [0.15, 0.15, 0.24]]] },
  { id: 'ojos', ref: true, nombre: 'Ojos', lado: 'izq', top: 15, pos: [-0.11, 2.45, 0.3], piezas: [['esfera', [-0.11, 2.45, 0.29], [0.06, 0.04, 0.04]], ['esfera', [0.11, 2.45, 0.29], [0.06, 0.04, 0.04]]] },
  { id: 'temp', nombre: 'Temperatura', lado: 'der', top: 15, pos: [0.31, 2.36, 0.02], piezas: [['esfera', [0.31, 2.36, 0.02], [0.06, 0.06, 0.06]]] },
  { id: 'spo2', nombre: 'Pulmones', lado: 'izq', top: 27, pos: [-0.27, 1.36, 0.06], piezas: [['esfera', [-0.27, 1.34, 0.02], [0.2, 0.36, 0.2]], ['esfera', [0.27, 1.34, 0.02], [0.2, 0.36, 0.2]]] },
  { id: 'hr', nombre: 'Corazón', lado: 'der', top: 27, pos: [0.08, 1.2, 0.16], late: true, piezas: [['esfera', [0.08, 1.2, 0.14], [0.14, 0.17, 0.13]]] },
  { id: 'bp', nombre: 'Presión', lado: 'izq', top: 38, pos: [-0.86, 1.1, 0], piezas: [['aro', [-0.86, 1.1, 0], [0.15, 0.3, 0.15]]] },
  { id: 'inmune', ref: true, nombre: 'Inmune', lado: 'der', top: 38, pos: [0.58, 1.5, 0.04], piezas: [['esfera', [0.57, 1.56, 0.04], [0.045, 0.045, 0.045]], ['esfera', [0.62, 1.45, 0.02], [0.045, 0.045, 0.045]], ['esfera', [0.54, 1.4, 0.08], [0.04, 0.04, 0.04]]] },
  { id: 'glu', nombre: 'Glucosa', lado: 'der', top: 49, pos: [0.06, 0.5, 0.14], piezas: [['esfera', [0.02, 0.5, 0.12], [0.28, 0.1, 0.15]]] },
  { id: 'huesos', ref: true, nombre: 'Huesos', lado: 'izq', top: 64, pos: [-0.27, -0.8, 0], piezas: [['capsula', [-0.27, -0.8, 0], [0.045, 0.78, 0.045]]] },
  { id: 'musculo', ref: true, nombre: 'Músculo', lado: 'der', top: 64, pos: [0.3, -0.8, 0.12], piezas: [['esfera', [0.28, -0.8, 0.1], [0.12, 0.46, 0.11]]] },
];

// Anillos del cuerpo como un solo conjunto de segmentos
function geometriaCuerpo(paso) {
  const pos = [];
  const SEG = 36;
  for (let y = 26; y <= 612; y += paso) {
    partesEn(y).forEach((p) => {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2;
        const a1 = ((i + 1) / SEG) * Math.PI * 2;
        const fondo = (p.hw * p.k) / 100;
        const dz = (p.dz || 0) / 100;
        pos.push(X(p.cx + p.hw * Math.cos(a0)), Y(y), dz + fondo * Math.sin(a0), X(p.cx + p.hw * Math.cos(a1)), Y(y), dz + fondo * Math.sin(a1));
      }
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

function aroPlano(radio, y, seg = 64) {
  const pos = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    pos.push(radio * Math.cos(a0), y, radio * Math.sin(a0), radio * Math.cos(a1), y, radio * Math.sin(a1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

function Cuerpo({ quieto }) {
  const cuerpo = useMemo(() => geometriaCuerpo(5), []);
  const base = useMemo(() => [1.2, 0.86, 0.48].map((r) => aroPlano(r, -2.98)), []);
  const barrido = useMemo(() => aroPlano(0.78, 0), []);
  const refBarrido = useRef(null);
  useFrame(({ clock }) => {
    if (refBarrido.current && !quieto) refBarrido.current.position.y = 2.9 - ((clock.elapsedTime * 0.8) % 5.9);
  });
  return (
    <group>
      <lineSegments geometry={cuerpo}><lineBasicMaterial color="#a4ff70" transparent opacity={0.62} blending={AdditiveBlending} depthWrite={false} toneMapped={false} /></lineSegments>
      {base.map((g, i) => <lineSegments key={i} geometry={g}><lineBasicMaterial color="#38503d" toneMapped={false} /></lineSegments>)}
      {!quieto && <lineSegments ref={refBarrido} geometry={barrido}><lineBasicMaterial color="#a4ff70" transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} toneMapped={false} /></lineSegments>}
    </group>
  );
}

function Pieza({ tipo, pos, escala, color, opacidad }) {
  const material = <meshBasicMaterial color={color} transparent opacity={opacidad} depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false} />;
  if (tipo === 'aro') return <mesh position={pos}><cylinderGeometry args={[escala[0], escala[0], escala[1], 20, 1, true]} />{material}</mesh>;
  if (tipo === 'capsula') return <mesh position={pos}><capsuleGeometry args={[escala[0], escala[1], 4, 10]} />{material}</mesh>;
  return <mesh position={pos} scale={escala}><sphereGeometry args={[1, 20, 14]} />{material}</mesh>;
}

function Zona({ zona, status, activa, bpm, onSelect, quieto }) {
  const grupo = useRef(null);
  const [encima, setEncima] = useState(false);
  const color = COLOR[status];
  useFrame(({ clock }) => {
    if (!grupo.current) return;
    let s = activa ? 1.12 : 1;
    if (zona.late && bpm > 0 && !quieto) {   // latido al ritmo de la frecuencia cardíaca
      const f = (clock.elapsedTime * bpm / 60) % 1;
      s *= 1 + 0.22 * Math.exp(-(((f - 0.1) / 0.06) ** 2)) + 0.1 * Math.exp(-(((f - 0.28) / 0.06) ** 2));
    }
    grupo.current.scale.setScalar(s);
  });
  // El grupo escala alrededor del ancla de la zona
  return (
    <group position={zona.pos}>
      <group ref={grupo}
        onClick={(e) => { e.stopPropagation(); onSelect(zona.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setEncima(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setEncima(false); document.body.style.cursor = ''; }}>
        {zona.piezas.map(([tipo, pos, escala], i) => (
          <group key={i} position={[pos[0] - zona.pos[0], pos[1] - zona.pos[1], pos[2] - zona.pos[2]]}>
            <Pieza tipo={tipo} pos={[0, 0, 0]} escala={escala} color={color} opacidad={activa ? 0.85 : encima ? 0.6 : zona.ref ? 0.22 : 0.42} />
            {tipo === 'esfera' && <mesh scale={escala}><sphereGeometry args={[1.04, 12, 8]} /><meshBasicMaterial color={color} wireframe transparent opacity={activa ? 0.9 : 0.4} toneMapped={false} /></mesh>}
          </group>
        ))}
      </group>
    </group>
  );
}

// Une cada rótulo (HTML) con su órgano proyectado en pantalla; se actualiza en cada cuadro
function Guias({ anclas }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    ZONAS.forEach((zona) => {
      const a = anclas.current[zona.id];
      if (!a?.linea) return;
      v.set(zona.pos[0], zona.pos[1], zona.pos[2]).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      a.linea.setAttribute('points', `${x.toFixed(1)},${y.toFixed(1)} ${a.codo},${a.y} ${a.x},${a.y}`);
    });
  });
  return null;
}

class Limite extends Component {
  constructor(props) { super(props); this.state = { fallo: false }; }
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch() { this.props.onFallo?.(); }
  render() { return this.state.fallo ? null : this.props.children; }
}

function hayWebGL() {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function BodyViewer3D({ crew, indicators, latest, selected, onSelect, onFallo }) {
  const [disponible] = useState(hayWebGL);
  const caja = useRef(null);
  const anclas = useRef({});
  const [quieto] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tocado, setTocado] = useState(false);

  useEffect(() => { if (!disponible) onFallo?.(); }, [disponible, onFallo]);
  // Al cerrar la vista 3D el navegador también "pierde" el contexto: eso no es un fallo
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // Posición de cada rótulo dentro de la caja, para trazar su línea guía
  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => {
      const marco = el.getBoundingClientRect();
      el.querySelectorAll('[data-zona]').forEach((etq) => {
        const r = etq.getBoundingClientRect();
        const izq = etq.dataset.lado === 'izq';
        const x = izq ? r.right - marco.left + 4 : r.left - marco.left - 4;
        anclas.current[etq.dataset.zona] = { ...anclas.current[etq.dataset.zona], x: x.toFixed(1), y: (r.bottom - marco.top - 3).toFixed(1), codo: (izq ? x + 22 : x - 22).toFixed(1) };
      });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [disponible]);

  if (!disponible) return null;
  const bpm = latest?.hr?.quality === 'no_signal' ? 0 : Number(latest?.hr?.value) || 0;
  const estado = (zona) => (zona.ref || !indicators[zona.id] ? 'ref' : getStatus(indicators[zona.id], crew, latest?.[zona.id]));

  return (
    <Limite onFallo={onFallo}>
      <div className="cuerpo3d" ref={caja}>
        <div className="c3-lienzo" role="img" aria-label="Figura humana en 3D. Arrastra para girarla. Usa los rótulos de los lados para elegir una zona."
          onPointerDown={() => setTocado(true)}>
          <Canvas flat camera={{ position: [0, 0.05, 10.3], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
            onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (vivo.current) onFallo?.(); })}
            onPointerMissed={() => { document.body.style.cursor = ''; }}>
            <Cuerpo quieto={quieto} />
            {ZONAS.map((zona) => (zona.ref || indicators[zona.id]) && <Zona key={zona.id} zona={zona} status={estado(zona)} activa={selected === zona.id} bpm={bpm} onSelect={onSelect} quieto={quieto} />)}
            <Guias anclas={anclas} />
            <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.25} maxPolarAngle={Math.PI / 1.9} autoRotate={!quieto && !tocado && !selected} autoRotateSpeed={1.1} target={[0, 0.05, 0]} />
          </Canvas>
        </div>
        <svg className="c3-guias" aria-hidden="true">
          {ZONAS.map((zona) => <polyline key={zona.id} className={`st-${estado(zona)}${selected === zona.id ? ' is-selected' : ''}`} ref={(el) => { anclas.current[zona.id] = { ...anclas.current[zona.id], linea: el }; }} />)}
        </svg>
        {ZONAS.map((zona) => {
          const indicator = zona.ref ? null : indicators[zona.id];
          if (!zona.ref && !indicator) return null;
          const st = estado(zona);
          const reading = latest?.[zona.id];
          const valor = reading?.quality === 'no_signal' || reading?.value == null ? '—' : reading.value;
          return (
            <button key={zona.id} type="button" data-zona={zona.id} data-lado={zona.lado} className={`c3-etq c3-${zona.lado} st-${st}${selected === zona.id ? ' is-selected' : ''}`} style={{ top: `${zona.top}%` }}
              aria-pressed={selected === zona.id} onClick={() => onSelect(zona.id)}
              aria-label={indicator ? `${zona.nombre}: ${indicator.name}, ${valor} ${indicator.unit}, ${STATUS_LABEL[st]}` : `${zona.nombre}: sin sensor en este prototipo, información de referencia`}>
              <span>{zona.nombre}</span>
              {indicator ? <strong>{GLIFO[st]} {valor}<small> {indicator.unit}</small></strong> : <em>◇ sin sensor</em>}
            </button>
          );
        })}
        <p className="c3-pista">{quieto ? 'Arrastra para girar la figura' : tocado || selected ? 'Arrastra para girar la figura' : 'Gira sola · arrastra para moverla'}</p>
      </div>
    </Limite>
  );
}
