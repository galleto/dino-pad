import * as THREE from 'three';
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { ANATOMY_STRUCTURES, ATTRIBUTION } from 'open-anatomy-3d';
import maleModelUrl from 'open-anatomy-3d/models/anatomy-male.glb?url';
import femaleModelUrl from 'open-anatomy-3d/models/anatomy-female.glb?url';
import { getStatus } from '../services/health';
import { colorForStatus } from './organs/modelUtils';
import './BodyViewer3D.css';

const HeartModel = lazy(() => import('./organs/HeartModel.jsx'));
const BloodPressureModel = lazy(() => import('./organs/BloodPressureModel.jsx'));
const LungsModel = lazy(() => import('./organs/LungsModel.jsx'));
const TemperatureModel = lazy(() => import('./organs/TemperatureModel.jsx'));
const GlucoseModel = lazy(() => import('./organs/GlucoseModel.jsx'));
const SleepModel = lazy(() => import('./organs/SleepModel.jsx'));
const MoodModel = lazy(() => import('./organs/MoodModel.jsx'));

const STRUCTURES_BY_INDICATOR = {
  hr: ['heart'],
  bp: ['heart', 'coronary_arteries', 'vena_cava_inferior', 'vena_cava_superior'],
  spo2: ['lung_l', 'lung_r'],
  temp: [],
  glu: ['pancreas', 'liver'],
  sleep: ['brain'],
  mood: ['brain'],
};
const NO_STRUCTURES = [];

const SKIN_KEYS = ANATOMY_STRUCTURES
  .filter((structure) => structure.system === 'skin')
  .map((structure) => structure.key);

const POINTS = [
  { indicatorId: 'hr', name: 'Corazón' },
  { indicatorId: 'bp', name: 'Presión arterial' },
  { indicatorId: 'spo2', name: 'Pulmones' },
  { indicatorId: 'temp', name: 'Temperatura' },
  { indicatorId: 'glu', name: 'Glucosa' },
  { indicatorId: 'sleep', name: 'Sueño' },
  { indicatorId: 'mood', name: 'Ánimo' },
];

const STATUS_COLORS = {
  ok: '#5fd3a0',
  warn: '#f2b84b',
  crit: '#f26b6b',
  nodata: '#66758c',
};

const MODEL_BY_INDICATOR = {
  hr: HeartModel,
  bp: BloodPressureModel,
  spo2: LungsModel,
  temp: TemperatureModel,
  glu: GlucoseModel,
  sleep: SleepModel,
  mood: MoodModel,
};

function AnatomyModel({ sex, selected, selectedStatus, onSelect }) {
  const { scene } = useGLTF(sex === 'male' ? maleModelUrl : femaleModelUrl, false, true);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const ownedMaterials = new Set();
    clone.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const cloneMaterial = (material) => {
        const copy = material.clone();
        ownedMaterials.add(copy);
        copy.userData = {
          ...copy.userData,
          baseColor: copy.color?.clone(),
          baseEmissive: copy.emissive?.clone(),
          baseEmissiveIntensity: copy.emissiveIntensity,
        };
        return copy;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
      object.castShadow = true;
      object.receiveShadow = true;
    });
    clone.userData.ownedMaterials = ownedMaterials;
    return clone;
  }, [scene]);

  const geometry = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = 3 / Math.max(size.x, size.y, size.z, 0.25);
    return { center, scale };
  }, [model]);

  const selectedKeys = STRUCTURES_BY_INDICATOR[selected] || NO_STRUCTURES;
  const selectedColor = STATUS_COLORS[selectedStatus] || STATUS_COLORS.nodata;

  useEffect(() => () => {
    model.userData.ownedMaterials.forEach((material) => material.dispose());
  }, [model]);

  useEffect(() => {
    const skinSet = new Set(SKIN_KEYS);
    model.traverse((object) => {
      if (!skinSet.has(object.name)) return;
      object.visible = true;
      object.traverse((child) => {
        if (!child.isMesh) return;
        if (!child.userData.ghostMaterial) {
          child.userData.ghostMaterial = new THREE.MeshBasicMaterial({
            color: '#78f5a8',
            transparent: true,
            depthWrite: false,
          });
          model.userData.ownedMaterials.add(child.userData.ghostMaterial);
        }
        child.userData.ghostMaterial.opacity = selected === 'temp' ? 0.3 : 0.1;
        child.material = child.userData.ghostMaterial;
        child.raycast = () => {};
      });
    });
  }, [model, selected]);

  useEffect(() => {
    const selectedSet = new Set(selectedKeys);
    model.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      let parent = object;
      let isSelected = false;
      while (parent && parent !== model.parent) {
        if (selectedSet.has(parent.name)) {
          isSelected = true;
          break;
        }
        parent = parent.parent;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        const base = material.userData;
        if (material.emissive && base.baseEmissive) {
          material.emissive.copy(isSelected ? new THREE.Color(selectedColor) : base.baseEmissive);
          material.emissiveIntensity = isSelected ? 1.5 : base.baseEmissiveIntensity;
        } else if (material.color && base.baseColor) {
          if (isSelected) material.color.copy(base.baseColor).lerp(new THREE.Color(selectedColor), 0.65);
          else material.color.copy(base.baseColor);
        }
        material.needsUpdate = true;
      });
    });
  }, [model, selectedKeys, selectedColor]);

  const handleStructureClick = (event) => {
    event.stopPropagation();
    let object = event.object;
    while (object && object !== model.parent) {
      const match = Object.entries(STRUCTURES_BY_INDICATOR)
        .find(([, keys]) => keys.includes(object.name));
      if (match) {
        onSelect(match[0]);
        return;
      }
      object = object.parent;
    }
  };

  return (
    <group
      scale={geometry.scale}
      position={[
        -geometry.center.x * geometry.scale,
        -geometry.center.y * geometry.scale,
        -geometry.center.z * geometry.scale,
      ]}
    >
      <primitive object={model} onClick={handleStructureClick} />
    </group>
  );
}

function CameraRig({ distance, controlsRef }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [camera, controlsRef, distance]);
  return null;
}

function SceneReveal({ children, reducedMotion }) {
  const groupRef = useRef(null);
  const elapsedRef = useRef(0);
  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return;
    elapsedRef.current = Math.min(0.28, elapsedRef.current + delta);
    const progress = elapsedRef.current / 0.28;
    const eased = 1 - (1 - progress) ** 2;
    groupRef.current.scale.setScalar(0.88 + eased * 0.12);
  });
  return <group ref={groupRef} scale={reducedMotion ? 1 : 0.88}>{children}</group>;
}

class ViewerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="viewer-fallback" role="status">
          No se pudo cargar el modelo anatómico. Las lecturas siguen disponibles.
        </div>
      );
    }
    return this.props.children;
  }
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reducedMotion;
}

export default function BodyViewer3D({
  crew,
  indicators,
  latest,
  selected,
  onSelect,
  selectionRequest = 0,
  value,
  displayValue,
  unit,
  range,
  status,
  signal,
}) {
  const [webglFailed, setWebglFailed] = useState(false);
  const [sex, setSex] = useState('male');
  const [activeOrgan, setActiveOrgan] = useState(null);
  const controlsRef = useRef(null);
  const previousSelectionRef = useRef(selected);
  const previousRequestRef = useRef(selectionRequest);
  const reducedMotion = useReducedMotion();
  const indicatorFor = (id) => indicators?.[id];
  const selectedIndicator = indicatorFor(selected);
  const selectedStatus = status || (selectedIndicator
    ? getStatus(selectedIndicator, crew, latest?.[selected])
    : 'nodata');
  const modelColor = colorForStatus(status || selectedStatus, signal !== false);
  const Model = activeOrgan ? MODEL_BY_INDICATOR[activeOrgan] : null;

  useEffect(() => {
    if (
      previousSelectionRef.current !== selected
      || previousRequestRef.current !== selectionRequest
    ) {
      previousSelectionRef.current = selected;
      previousRequestRef.current = selectionRequest;
      setActiveOrgan(selected || null);
    }
  }, [selected, selectionRequest]);

  if (webglFailed) {
    return (
      <div className="viewer-fallback" role="status">
        Visor 3D no disponible. Las tarjetas y lecturas siguen disponibles.
      </div>
    );
  }

  const chooseIndicator = (indicatorId) => {
    setActiveOrgan(indicatorId);
    onSelect(indicatorId);
  };

  const modelProps = {
    value,
    displayValue,
    unit,
    range,
    status: status || selectedStatus,
    signal: signal !== false,
    motionScale: reducedMotion ? 0.15 : 1,
  };

  return (
    <ViewerBoundary>
      <div className="body-viewer">
        <div className="viewer-main">
          <div className="viewer-toolbar">
            <div className="viewer-model-switch" aria-label="Variante anatómica">
              <button
                type="button"
                className={sex === 'male' ? 'active' : ''}
                onClick={() => setSex('male')}
                aria-pressed={sex === 'male'}
              >
                Masculino
              </button>
              <button
                type="button"
                className={sex === 'female' ? 'active' : ''}
                onClick={() => setSex('female')}
                aria-pressed={sex === 'female'}
              >
                Femenino
              </button>
            </div>
            {activeOrgan && (
              <button
                className="viewer-back"
                type="button"
                onClick={() => setActiveOrgan(null)}
              >
                Volver al cuerpo
              </button>
            )}
          </div>

          <p className="viewer-hint">
            {activeOrgan
              ? 'Modelo 3D individual · arrastra para rotar.'
              : 'Selecciona un indicador o haz clic sobre un órgano para explorarlo.'}
          </p>

          <div className="viewer-canvas">
            <Canvas
              camera={{ position: [0, 0, 5], fov: 42, near: 0.1, far: 100 }}
              dpr={[1, 1.5]}
              fallback={<div className="viewer-fallback">WebGL no está disponible.</div>}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', (event) => {
                  event.preventDefault();
                  setWebglFailed(true);
                }, { once: true });
              }}
            >
              <color attach="background" args={['#08111f']} />
              <ambientLight intensity={0.9} />
              <directionalLight position={[3, 4, 5]} intensity={1.2} />
              <pointLight position={[-3, 1, 2]} color={modelColor} intensity={0.8} />
              <CameraRig distance={activeOrgan ? 4.2 : 5.2} controlsRef={controlsRef} />
              <Suspense fallback={null}>
                {activeOrgan && Model ? (
                  <SceneReveal key={activeOrgan} reducedMotion={reducedMotion}>
                    <Model {...modelProps} />
                  </SceneReveal>
                ) : (
                  <SceneReveal key="body" reducedMotion={reducedMotion}>
                    <AnatomyModel
                      sex={sex}
                      selected={selected}
                      selectedStatus={selectedStatus}
                      onSelect={chooseIndicator}
                    />
                  </SceneReveal>
                )}
              </Suspense>
              <OrbitControls
                ref={controlsRef}
                makeDefault
                enablePan={false}
                enableZoom={false}
                enableDamping
              />
            </Canvas>
          </div>

          {activeOrgan && (
            <div className={`viewer-organ-readout status-${modelProps.status}`}>
              <div>
                <span className="viewer-state-dot" style={{ backgroundColor: modelColor }} />
                <strong>{displayValue ?? '—'}</strong>
                <span>{unit}</span>
              </div>
              <small>{range?.label || 'Rango de referencia no disponible'}</small>
            </div>
          )}
        </div>

        <div className="viewer-legend" aria-label="Indicadores de salud">
          {POINTS.map((point) => {
            const indicator = indicatorFor(point.indicatorId);
            if (!indicator) return null;
            const pointStatus = point.indicatorId === selected
              ? selectedStatus
              : getStatus(indicator, crew, latest?.[point.indicatorId]);
            return (
              <button
                key={point.indicatorId}
                type="button"
                className={`viewer-point status-${pointStatus}${activeOrgan === point.indicatorId ? ' selected' : ''}`}
                onClick={() => chooseIndicator(point.indicatorId)}
                aria-pressed={activeOrgan === point.indicatorId}
              >
                <i style={{ backgroundColor: STATUS_COLORS[pointStatus] || STATUS_COLORS.nodata }} />
                <span>{point.name}</span>
              </button>
            );
          })}
        </div>

        <p className="viewer-attribution">{ATTRIBUTION}</p>
      </div>
    </ViewerBoundary>
  );
}
