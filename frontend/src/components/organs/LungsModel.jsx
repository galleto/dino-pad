import { useMemo, useRef } from 'react';
import { CubicBezierCurve3, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { colorForStatus } from './modelUtils';

function Bronchus({ start, end, color }) {
  const curve = useMemo(
    () => new CubicBezierCurve3(new Vector3(...start), new Vector3(...start.map((value, i) => value * 0.7 + end[i] * 0.3)), new Vector3(...start.map((value, i) => value * 0.3 + end[i] * 0.7)), new Vector3(...end)),
    [start, end],
  );
  return (
    <mesh>
      <tubeGeometry args={[curve, 18, 0.025, 5, false]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.8} />
    </mesh>
  );
}

export default function LungsModel({ status, signal, motionScale }) {
  const lungsRef = useRef(null);
  const elapsedRef = useRef(0);
  const color = colorForStatus(status, signal);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    if (!lungsRef.current) return;
    const breath = Math.sin(elapsedRef.current * Math.PI * 2 * (14 / 60)) * 0.035 * motionScale;
    lungsRef.current.scale.set(1 + breath * 0.6, 1 + breath, 1 + breath * 0.5);
  });

  return (
    <group ref={lungsRef}>
      <mesh position={[-0.5, 0, 0]}>
        <sphereGeometry args={[0.56, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} transparent opacity={0.68} roughness={0.45} />
      </mesh>
      <mesh position={[0.5, 0, 0]}>
        <sphereGeometry args={[0.56, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} transparent opacity={0.68} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.85} />
      </mesh>
      <Bronchus start={[0, 0.35, 0]} end={[-0.56, 0.05, 0]} color={color} />
      <Bronchus start={[0, 0.35, 0]} end={[0.56, 0.05, 0]} color={color} />
      <Bronchus start={[-0.42, 0.12, 0]} end={[-0.78, -0.25, 0]} color={color} />
      <Bronchus start={[0.42, 0.12, 0]} end={[0.78, -0.25, 0]} color={color} />
    </group>
  );
}
