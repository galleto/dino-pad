import { useMemo, useRef } from 'react';
import { Shape } from 'three';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, clamp } from './modelUtils';

const PARTICLE_COUNT = 12;

export default function GlucoseModel({ value, status, signal, motionScale }) {
  const dropRef = useRef(null);
  const particlesRef = useRef([]);
  const elapsedRef = useRef(0);
  const color = colorForStatus(status, signal);
  const shape = useMemo(() => {
    const drop = new Shape();
    drop.moveTo(0, -0.9);
    drop.bezierCurveTo(-0.25, -0.55, -0.68, -0.02, -0.64, 0.38);
    drop.bezierCurveTo(-0.6, 1.12, 0.6, 1.12, 0.64, 0.38);
    drop.bezierCurveTo(0.68, -0.02, 0.25, -0.55, 0, -0.9);
    return drop;
  }, []);
  const particleData = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
      phase: (index / PARTICLE_COUNT) * Math.PI * 2,
      radius: 0.82 + (index % 3) * 0.08,
      height: 0.2 + (index % 4) * 0.1,
    })),
    [],
  );
  const particleTotal = Math.round(clamp(Number(value) || 0, 40, 250) / 21);
  const speed = clamp(Number(value) / 100 || 0.5, 0.4, 2.5);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const time = elapsedRef.current * speed * motionScale;
    if (dropRef.current) dropRef.current.rotation.y = Math.sin(time * 0.35) * 0.12;
    for (let index = 0; index < particlesRef.current.length; index += 1) {
      const particle = particlesRef.current[index];
      if (!particle) continue;
      particle.visible = signal && index < particleTotal;
      if (!particle.visible) continue;
      const data = particleData[index];
      const angle = time + data.phase;
      particle.position.set(
        Math.cos(angle) * data.radius,
        Math.sin(angle * 0.8) * data.height,
        Math.sin(angle) * data.radius * 0.4 + 0.15,
      );
    }
  });

  return (
    <group>
      <mesh ref={dropRef}>
        <extrudeGeometry args={[shape, { depth: 0.22, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.05, bevelThickness: 0.05 }]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.8} roughness={0.35} />
      </mesh>
      {particleData.map((particle, index) => (
        <mesh
          key={index}
          ref={(element) => { particlesRef.current[index] = element; }}
          position={[Math.cos(particle.phase) * particle.radius, 0, Math.sin(particle.phase) * particle.radius * 0.4]}
        >
          <sphereGeometry args={[0.055, 6, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
        </mesh>
      ))}
    </group>
  );
}
