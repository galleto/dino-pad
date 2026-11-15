import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei';
import { ATTRIBUTION } from 'open-anatomy-3d';
import maleModelUrl from 'open-anatomy-3d/models/anatomy-male.glb?url';
import femaleModelUrl from 'open-anatomy-3d/models/anatomy-female.glb?url';

function cloneOrganScene(scene, structures) {
  const clone = scene.clone(true);
  const selected = new Set(structures);

  clone.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    let parent = object;
    let visible = false;
    while (parent) {
      if (selected.has(parent.name)) {
        visible = true;
        break;
      }
      if (parent === clone) break;
      parent = parent.parent;
    }

    const cloneMaterial = (material) => {
      const copy = material.clone();
      copy.userData = {
        ...copy.userData,
        baseColor: copy.color?.clone(),
      };
      return copy;
    };

    object.visible = visible;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
    object.castShadow = true;
    object.receiveShadow = true;
  });

  return clone;
}

function OrganModel({ sex, structures, color, heartRate, respirationRate }) {
  const rootRef = useRef(null);
  const url = sex === 'female' ? femaleModelUrl : maleModelUrl;
  const { scene } = useGLTF(url, false, true);
  const model = useMemo(() => cloneOrganScene(scene, structures), [scene, structures]);

  const geometry = useMemo(() => {
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    structures.forEach((name) => {
      const structure = model.getObjectByName(name);
      if (structure) box.expandByObject(structure);
    });
    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.01);
    return { center, size, scale: 2.4 / maxDimension };
  }, [model, structures]);

  useEffect(() => {
    model.traverse((object) => {
      if (!object.isMesh || !object.visible || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material.emissive) {
          material.emissive.set(color);
          material.emissiveIntensity = 1.25;
        }
        if (material.color && material.userData.baseColor) {
          material.color.copy(material.userData.baseColor).lerp(new THREE.Color(color), 0.18);
        }
        material.needsUpdate = true;
      });
    });
  }, [model, color]);

  useFrame(({ clock }) => {
    if (!rootRef.current || !geometry) return;
    const time = clock.elapsedTime;
    if (structures.includes('heart')) {
      const rate = Math.max(30, heartRate || 60) / 60;
      const phase = (time * rate) % 1;
      const beat = Math.exp(-(((phase - 0.12) / 0.1) ** 2));
      const scale = geometry.scale * (1 + 0.07 * beat);
      rootRef.current.scale.setScalar(scale);
    } else if (structures.includes('lung_l')) {
      const breath = Math.sin(time * Math.PI * 2 * (Math.max(6, respirationRate || 16) / 60));
      rootRef.current.scale.set(
        geometry.scale * (1 + 0.025 * breath),
        geometry.scale * (1 + 0.04 * breath),
        geometry.scale * (1 + 0.025 * breath),
      );
    } else {
      const pulse = 1 + 0.006 * Math.sin(time * Math.PI * 0.5);
      rootRef.current.scale.setScalar(geometry.scale * pulse);
    }
  });

  if (!geometry) return null;
  return (
    <group
      ref={rootRef}
      scale={geometry.scale}
      position={[
        -geometry.center.x * geometry.scale,
        -geometry.center.y * geometry.scale,
        -geometry.center.z * geometry.scale,
      ]}
    >
      <primitive object={model} />
    </group>
  );
}

export default function OrganViewer3D({ structures, statusColor, heartRate, respirationRate }) {
  return (
    <div className="organ-viewer">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 42 }}
        dpr={[1, 1.5]}
        fallback={<div className="organ-viewer-fallback">WebGL no está disponible.</div>}
      >
        <color attach="background" args={['#08111f']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <pointLight position={[-3, 1, 2]} color={statusColor} intensity={0.8} />
        <Bounds fit clip margin={1.2}>
          <Suspense fallback={null}>
            <OrganModel
              key={structures.join('-')}
              sex="male"
              structures={structures}
              color={statusColor}
              heartRate={heartRate}
              respirationRate={respirationRate}
            />
          </Suspense>
        </Bounds>
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={0.6}
          maxDistance={10}
          enableDamping
        />
      </Canvas>
      <small className="organ-viewer-credit">{ATTRIBUTION}</small>
    </div>
  );
}
