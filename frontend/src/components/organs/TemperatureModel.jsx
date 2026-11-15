import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, clamp } from './modelUtils';

function temperatureColor(value) {
  if (!Number.isFinite(Number(value))) return '#7d8996';
  if (value < 36.1) return '#65b9ff';
  if (value <= 37.2) return '#72f5a4';
  if (value < 38) return '#f5b84f';
  return '#ff5f68';
}

export default function TemperatureModel({ value, status, signal, motionScale }) {
  const fillRef = useRef(null);
  const fillMaterialRef = useRef(null);
  const haloRef = useRef(null);
  const initialLevel = clamp((Number(value) - 32) / 10, 0.05, 1);
  const targetLevelRef = useRef(initialLevel);
  const levelRef = useRef(initialLevel);
  const tone = signal ? temperatureColor(Number(value)) : colorForStatus(status, false);

  useEffect(() => {
    targetLevelRef.current = clamp((Number(value) - 32) / 10, 0.05, 1);
  }, [value]);

  useFrame((_, delta) => {
    if (!fillRef.current) return;
    levelRef.current += (targetLevelRef.current - levelRef.current) * Math.min(1, delta * 3 * motionScale);
    fillRef.current.scale.y = levelRef.current;
    fillRef.current.position.y = -0.42 + levelRef.current * 0.42;
    if (fillMaterialRef.current) fillMaterialRef.current.emissiveIntensity = 0.7 + levelRef.current * 0.8;
    if (haloRef.current) haloRef.current.rotation.z += delta * 0.06 * motionScale;
  });

  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 1.65, 12]} />
        <meshStandardMaterial color="#b8ffe0" emissive={tone} emissiveIntensity={0.25} transparent opacity={0.18} />
      </mesh>
      <mesh ref={fillRef} position={[0, 0, 0.02]}>
        <cylinderGeometry args={[0.075, 0.075, 0.84, 10]} />
        <meshStandardMaterial ref={fillMaterialRef} color={tone} emissive={tone} emissiveIntensity={1} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, -0.9, 0]}>
        <sphereGeometry args={[0.27, 12, 10]} />
        <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={1.2} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, -0.88, -0.08]}>
        <torusGeometry args={[0.46, 0.018, 5, 36]} />
        <meshBasicMaterial color={tone} transparent opacity={0.55} />
      </mesh>
      <mesh ref={haloRef} position={[0, -0.88, -0.08]}>
        <torusGeometry args={[0.56, 0.012, 4, 36]} />
        <meshBasicMaterial color={tone} transparent opacity={0.25} />
      </mesh>
    </group>
  );
}
