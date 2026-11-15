import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, normalizedValue } from './modelUtils';

const PARTICLE_COUNT = 10;

export default function MoodModel({ value, range, status, signal, motionScale }) {
  const particlesRef = useRef([]);
  const elapsedRef = useRef(0);
  const energy = normalizedValue(value, range);
  const color = colorForStatus(status, signal);
  const phases = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, index) => (index / PARTICLE_COUNT) * Math.PI * 2),
    [],
  );

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const speed = (0.15 + energy * 0.7) * motionScale;
    for (let index = 0; index < particlesRef.current.length; index += 1) {
      const particle = particlesRef.current[index];
      if (!particle) continue;
      const angle = phases[index] + elapsedRef.current * speed;
      const radius = 0.75 + energy * 0.22 + Math.sin(angle * 2) * 0.06;
      particle.position.set(Math.cos(angle) * radius, Math.sin(angle) * 0.68, Math.sin(angle) * 0.36);
      particle.scale.setScalar(0.45 + energy * 0.65);
    }
  });

  return (
    <group>
      <mesh position={[-0.33, 0, 0]}>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35 + energy} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0.33, 0, 0]}>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35 + energy} transparent opacity={0.75} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.88, 0.014, 4, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.24 + energy * 0.45} />
      </mesh>
      {phases.map((phase, index) => (
        <mesh
          key={index}
          ref={(element) => { particlesRef.current[index] = element; }}
        >
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6 + energy} />
        </mesh>
      ))}
    </group>
  );
}
