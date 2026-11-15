import { Component, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { getStatus } from '../services/health';
import './BodyViewer3D.css';

const POINTS = [
  { indicatorId: 'hr', name: 'Corazón', position: [-0.22, 0.62, 0.24] },
  { indicatorId: 'bp', name: 'Presión', position: [0.42, 0.47, 0.12] },
  { indicatorId: 'spo2', name: 'Pulmones', position: [0.13, 0.8, 0.25] },
  { indicatorId: 'temp', name: 'Muñeca', position: [-0.78, 0.0, 0.2] },
  { indicatorId: 'glu', name: 'Abdomen', position: [0.04, 0.0, 0.3] },
  { indicatorId: 'sleep', name: 'Sueño', position: [-0.18, 1.6, 0.1] },
  { indicatorId: 'mood', name: 'Ánimo', position: [0.2, 1.42, 0.12] },
];

function Skeleton() {
  return (
    <group>
      <mesh position={[0, 1.58, 0]}><sphereGeometry args={[.25, 16, 12]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.55} /></mesh>
      <mesh position={[0, 1.18, 0]}><sphereGeometry args={[.09, 10, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.4} /></mesh>
      <mesh position={[0, .66, 0]}><capsuleGeometry args={[.19, .45, 5, 10]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[0, .1, 0]} scale={[.82, .7, .7]}><sphereGeometry args={[.23, 12, 10]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.38} /></mesh>
      <mesh position={[-.31, .62, 0]} rotation={[0, 0, -.26]}><capsuleGeometry args={[.075, .58, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[.31, .62, 0]} rotation={[0, 0, .26]}><capsuleGeometry args={[.075, .58, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[-.76, .12, 0]} rotation={[0, 0, -.08]}><capsuleGeometry args={[.075, .58, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[.76, .12, 0]} rotation={[0, 0, .08]}><capsuleGeometry args={[.075, .58, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[-.16, -.73, 0]}><capsuleGeometry args={[.095, .72, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      <mesh position={[.16, -.73, 0]}><capsuleGeometry args={[.095, .72, 4, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.42} /></mesh>
      {[[0, 1.2, 0], [-.3, .62, 0], [.3, .62, 0], [-.76, .12, 0], [.76, .12, 0], [-.16, -.38, 0], [.16, -.38, 0], [-.16, -1.13, 0], [.16, -1.13, 0]].map((position, index) => <mesh key={index} position={position}><sphereGeometry args={[.09, 10, 8]} /><meshBasicMaterial color="#a4ff70" wireframe transparent opacity={.35} /></mesh>)}
      <Grid position={[0, -1.24, 0]} args={[3, 3]} cellSize={.25} cellThickness={.5} sectionSize={1} sectionThickness={.8} fadeDistance={4} fadeStrength={2} infiniteGrid />
    </group>
  );
}

function InterestPoint({ point, status, selected, onSelect }) {
  const colors = { ok: '#a4ff70', warn: '#ffc66d', crit: '#ff6b63', nodata: '#84958a' };
  const color = colors[status] || colors.nodata;
  return (
    <mesh position={point.position} onClick={(event) => { event.stopPropagation(); onSelect(point.indicatorId); }}>
      <sphereGeometry args={[selected ? .09 : .065, 12, 12]} />
      <meshBasicMaterial color={color} />
      <pointLight color={color} intensity={selected ? 2 : 1} distance={.45} />
    </mesh>
  );
}

class ViewerBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="viewer-fallback" role="status">No se pudo cargar WebGL. Las tarjetas y lecturas siguen disponibles.</div>;
    return this.props.children;
  }
}

export default function BodyViewer3D({ crew, indicators, latest, selected, onSelect }) {
  const [webglFailed, setWebglFailed] = useState(false);
  const indicatorFor = (id) => indicators[id];
  if (webglFailed) return <div className="viewer-fallback" role="status">Visor 3D no disponible en este navegador. Las tarjetas y lecturas siguen disponibles.</div>;
  return (
    <ViewerBoundary>
      <div className="body-viewer">
        <div className="viewer-canvas" role="img" aria-label="Modelo corporal holográfico interactivo. Arrastra para rotar y selecciona los puntos biométricos.">
          <Canvas camera={{ position: [0, .15, 4.2], fov: 42 }} dpr={[1, 1.5]} fallback={<div className="viewer-fallback">WebGL no está disponible. Las tarjetas y lecturas siguen disponibles.</div>} onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setWebglFailed(true); })}>
            <color attach="background" args={['#0b130e']} />
            <ambientLight intensity={.7} />
            <pointLight position={[2, 2, 3]} color="#a4ff70" intensity={1.3} />
            <Skeleton />
            {POINTS.map((point) => {
              const indicator = indicatorFor(point.indicatorId);
              return indicator && <InterestPoint key={point.indicatorId} point={point} status={getStatus(indicator, crew, latest?.[point.indicatorId])} selected={selected === point.indicatorId} onSelect={onSelect} />;
            })}
            <OrbitControls enablePan={false} minDistance={3} maxDistance={6} />
          </Canvas>
        </div>
        <div className="viewer-legend" aria-label="Puntos de interés del cuerpo">{POINTS.map((point) => {
          const indicator = indicatorFor(point.indicatorId);
          if (!indicator) return null;
          const status = getStatus(indicator, crew, latest?.[point.indicatorId]);
          return <button key={point.indicatorId} type="button" className={`viewer-point status-${status}${selected === point.indicatorId ? ' selected' : ''}`} onClick={() => onSelect(point.indicatorId)} aria-pressed={selected === point.indicatorId}><i />{point.name}</button>;
        })}</div>
      </div>
    </ViewerBoundary>
  );
}
