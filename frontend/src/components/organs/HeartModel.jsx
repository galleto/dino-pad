import { useMemo, useRef } from 'react';
import { Shape } from 'three';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, clamp } from './modelUtils';

export default function HeartModel({ value, status, signal, motionScale }) {
  const heartRef = useRef(null);
  const glowRef = useRef(null);
  const elapsedRef = useRef(0);
  const shape = useMemo(() => {
    const heart = new Shape();
    heart.moveTo(0, -0.62);
    heart.bezierCurveTo(-0.2, -0.35, -0.88, 0.02, -0.82, 0.48);
    heart.bezierCurveTo(-0.75, 1.02, -0.12, 1.02, 0, 0.54);
    heart.bezierCurveTo(0.12, 1.02, 0.75, 1.02, 0.82, 0.48);
    heart.bezierCurveTo(0.88, 0.02, 0.2, -0.35, 0, -0.62);
    return heart;
  }, []);
  const color = colorForStatus(status, signal);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    if (!heartRef.current || !glowRef.current) return;
    if (!signal || !Number.isFinite(Number(value))) {
      heartRef.current.scale.setScalar(1);
      glowRef.current.emissiveIntensity = 0.12;
      return;
    }
    const beatsPerSecond = clamp(Number(value), 30, 200) / 60;
    const phase = (elapsedRef.current * beatsPerSecond) % 1;
    const systole = Math.exp(-(((phase - 0.16) / 0.055) ** 2));
    const recovery = Math.exp(-(((phase - 0.34) / 0.08) ** 2)) * 0.24;
    const pulse = Math.max(systole, recovery);
    const amount = motionScale * pulse;
    heartRef.current.scale.set(1 + amount * 0.09, 1 + amount * 0.09, 1 + amount * 0.05);
    glowRef.current.emissiveIntensity = 0.45 + amount * 1.2;
  });

  return (
    <group>
      <mesh ref={heartRef}>
        <extrudeGeometry args={[shape, { depth: 0.3, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.07, bevelThickness: 0.07 }]} />
        <meshStandardMaterial ref={glowRef} color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.88} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.56, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.8} />
      </mesh>
      <mesh position={[-0.24, 0.76, 0]}>
        <cylinderGeometry args={[0.075, 0.12, 0.48, 7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.72} />
      </mesh>
      <mesh position={[0.25, 0.74, 0]}>
        <cylinderGeometry args={[0.075, 0.12, 0.48, 7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.72} />
      </mesh>
    </group>
  );
}
