import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, normalizedValue } from './modelUtils';

export default function SleepModel({ value, range, status, signal, motionScale }) {
  const brainRef = useRef(null);
  const waveRef = useRef(null);
  const elapsedRef = useRef(0);
  const color = colorForStatus(status, signal);
  const restFactor = normalizedValue(value, range);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    if (brainRef.current) {
      const breath = Math.sin(elapsedRef.current * Math.PI * 0.5) * 0.018 * motionScale;
      brainRef.current.scale.setScalar(0.9 + restFactor * 0.1 + breath);
    }
    if (waveRef.current) waveRef.current.rotation.z += delta * 0.08 * motionScale;
  });

  return (
    <group>
      <group ref={brainRef} position={[0, 0.1, 0]}>
        <mesh position={[-0.34, 0, 0]}>
          <sphereGeometry args={[0.52, 12, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35 + restFactor * 0.7} transparent opacity={0.78} />
        </mesh>
        <mesh position={[0.34, 0, 0]}>
          <sphereGeometry args={[0.52, 12, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35 + restFactor * 0.7} transparent opacity={0.78} />
        </mesh>
        <mesh position={[0, -0.43, 0]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      </group>
      <mesh ref={waveRef} position={[0, 0, -0.28]}>
        <torusGeometry args={[1.03, 0.018, 5, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.25 + restFactor * 0.35} />
      </mesh>
      <mesh position={[0.95, 0.86, 0.1]}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color="#c6ffe0" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[1.08, 0.94, 0.16]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshBasicMaterial color="#08111f" />
      </mesh>
    </group>
  );
}
