import { useMemo, useRef } from 'react';
import { CubicBezierCurve3, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { colorForStatus, clamp } from './modelUtils';

const SAMPLE_COUNT = 72;

export default function BloodPressureModel({ value, status, signal, motionScale }) {
  const particlesRef = useRef([]);
  const elapsedRef = useRef(0);
  const color = colorForStatus(status, signal);
  const routes = useMemo(() => [
    new CubicBezierCurve3(new Vector3(0, 0.2, 0), new Vector3(-0.1, 0.9, 0), new Vector3(-0.8, 0.95, 0), new Vector3(-1.25, 1.15, 0)),
    new CubicBezierCurve3(new Vector3(0, 0.2, 0), new Vector3(0.2, 0.9, 0), new Vector3(0.8, 0.95, 0), new Vector3(1.25, 1.15, 0)),
    new CubicBezierCurve3(new Vector3(0, 0.2, 0), new Vector3(0, -0.3, 0), new Vector3(-0.6, -0.7, 0), new Vector3(-1.15, -1.05, 0)),
  ], []);
  const samples = useMemo(
    () => routes.map((route) => Array.from({ length: SAMPLE_COUNT }, (_, index) => route.getPointAt(index / (SAMPLE_COUNT - 1)))),
    [routes],
  );

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const pressureFactor = clamp(Number(value) / 100 || 0.7, 0.45, 1.8);
    const speed = elapsedRef.current * pressureFactor * 0.18 * motionScale;
    for (let routeIndex = 0; routeIndex < particlesRef.current.length; routeIndex += 1) {
      const particle = particlesRef.current[routeIndex];
      if (!particle) continue;
      particle.visible = signal;
      if (!signal) continue;
      const progress = (speed + routeIndex / 3) % 1;
      const scaled = progress * (SAMPLE_COUNT - 1);
      const index = Math.min(SAMPLE_COUNT - 2, Math.floor(scaled));
      const fraction = scaled - index;
      const start = samples[routeIndex][index];
      const end = samples[routeIndex][index + 1];
      particle.position.set(
        start.x + (end.x - start.x) * fraction,
        start.y + (end.y - start.y) * fraction,
        start.z + (end.z - start.z) * fraction + 0.05,
      );
      particle.material.emissiveIntensity = 0.5 + pressureFactor * 0.6;
    }
  });

  return (
    <group>
      {routes.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 48, 0.035, 6, false]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.78} />
        </mesh>
      ))}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.37, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.82} />
      </mesh>
      {routes.map((_, index) => (
        <mesh key={index} ref={(element) => { particlesRef.current[index] = element; }}>
          <sphereGeometry args={[0.075, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}
