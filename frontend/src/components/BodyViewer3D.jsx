
import * as THREE from 'three';

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

import {
  ANATOMY_STRUCTURES,
  ATTRIBUTION,
} from 'open-anatomy-3d';

import maleModelUrl from 'open-anatomy-3d/models/anatomy-male.glb?url';
import femaleModelUrl from 'open-anatomy-3d/models/anatomy-female.glb?url';

import { getStatus } from '../services/health';
import './BodyViewer3D.css';

// ============================================================
// ESTRUCTURAS ANATÓMICAS RELACIONADAS CON LOS INDICADORES
// Son referencias visuales, no diagnósticos.
// ============================================================

const STRUCTURES_BY_INDICATOR = {
  hr: ['heart'],

  bp: [
    'heart',
    'coronary_arteries',
    'vena_cava_inferior',
    'vena_cava_superior',
  ],

  spo2: ['lung_l', 'lung_r'],

  // La temperatura es una medición general del cuerpo.
  temp: [],

  glu: ['pancreas', 'liver'],

  sleep: ['brain'],

  mood: ['brain'],
};

// Identificamos las estructuras que pertenecen a la piel.
const SKIN_KEYS = ANATOMY_STRUCTURES
  .filter((structure) => structure.system === 'skin')
  .map((structure) => structure.key);

// ============================================================
// INDICADORES
// ============================================================

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

// ============================================================
// MODELO ANATÓMICO
// ============================================================

function AnatomyModel({
  sex,
  selected,
  selectedStatus,
  onSelect,
  controlsRef,
}) 
{
  const { camera } = useThree();
  const rootRef = useRef();

  const url = sex === 'male' ? maleModelUrl : femaleModelUrl;

  // Cargamos el modelo GLB y habilitamos Meshopt.
  const { scene } = useGLTF(url, false, true);
  useEffect(() => {
  scene.traverse((object) => {
    if (object.name) {
      console.log(
        'ANATOMÍA:',
        object.name,
        object.type
      );
    }
  });
}, [scene]);

  // Clonamos el modelo y sus materiales.
  const model = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((object) => {
      if (!object.isMesh || !object.material) return;

      const cloneMaterial = (material) => {
        const copy = material.clone();

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

    return clone;
  }, [scene]);

  // Normalizamos el tamaño del modelo.
  const geometry = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDimension = Math.max(
      size.x,
      size.y,
      size.z,
      0.25,
    );

    const scale = 3.0 / maxDimension;

    return {
      center,
      scale,
    };
  }, [model]);

  const selectedKeys = STRUCTURES_BY_INDICATOR[selected] || [];

  const selectedColor =
    STATUS_COLORS[selectedStatus] || STATUS_COLORS.nodata;

  // La piel se muestra para temperatura y cuando no hay
  // una estructura interna seleccionada.
  const showSkin =
    selected === 'temp' || selectedKeys.length === 0;

  // ==========================================================
  // VISIBILIDAD DE LA PIEL
  // ==========================================================

 useEffect(() => {
  const skinSet = new Set(SKIN_KEYS);

  model.traverse((object) => {
    if (!skinSet.has(object.name)) return;

    object.visible = true;
    object.traverse((child) => {
      if (!child.isMesh) return;

      // Material holográfico plano: sin relieve ni sombreado
      if (!child.userData.ghostMaterial) {
        child.userData.ghostMaterial = new THREE.MeshBasicMaterial({
          color: '#5aa9ff',
          transparent: true,
          depthWrite: false,
        });
      }
      const ghost = child.userData.ghostMaterial;
      ghost.opacity = showSkin ? 0.3 : 0.1;
      child.material = ghost;

      // Los clics atraviesan la piel y llegan a los órganos
      child.raycast = () => {};
    });
  });
}, [model, showSkin]);

  // ==========================================================
  // RESALTADO DE ÓRGANOS
  // ==========================================================

  useEffect(() => {
    const selectedSet = new Set(selectedKeys);

    model.traverse((object) => {
      if (!object.isMesh || !object.material) return;

      // Revisamos también los grupos superiores.
      let parent = object;
      let isSelected = false;

      while (parent && parent !== model.parent) {
        if (selectedSet.has(parent.name)) {
          isSelected = true;
          break;
        }

        parent = parent.parent;
      }

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((material) => {
        const base = material.userData;

        if (material.emissive && base.baseEmissive) {
          material.emissive.copy(
            isSelected
              ? new THREE.Color(selectedColor)
              : base.baseEmissive,
          );

          material.emissiveIntensity = isSelected
            ? 1.5
            : base.baseEmissiveIntensity;
        } else if (material.color && base.baseColor) {
          if (isSelected) {
            material.color
              .copy(base.baseColor)
              .lerp(new THREE.Color(selectedColor), 0.65);
          } else {
            material.color.copy(base.baseColor);
          }
        }

        material.needsUpdate = true;
      });
    });
  }, [model, selectedKeys, selectedColor]);

  // ==========================================================
  // ACERCAMIENTO A LA ESTRUCTURA SELECCIONADA
  // ==========================================================

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    root.updateWorldMatrix(true, true);

    const box = new THREE.Box3();
    const selectedSet = new Set(selectedKeys);

    let foundStructure = false;

    if (selectedSet.size > 0) {
      model.traverse((object) => {
        if (!selectedSet.has(object.name)) return;

        box.expandByObject(object);
        foundStructure = true;
      });
    }

    // Si no encontramos una estructura, mostramos el cuerpo.
    if (!foundStructure || box.isEmpty()) {
      box.setFromObject(root);
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDimension = Math.max(
      size.x,
      size.y,
      size.z,
      0.25,
    );

    const distance = maxDimension * (
      foundStructure ? 3.2 : 1.8
    );

    const target = center;

    camera.position.set(
      target.x,
      target.y,
      target.z + distance,
    );

    camera.lookAt(target);

    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [
    selected,
    selectedKeys,
    model,
    geometry,
    camera,
    controlsRef,
  ]);

  // ==========================================================
  // SELECCIÓN DE ÓRGANOS MEDIANTE CLIC
  // ==========================================================

  const handleStructureClick = (event) => {
    event.stopPropagation();

    let object = event.object;

    const allStructures = Object.entries(
      STRUCTURES_BY_INDICATOR,
    );

    while (object && object !== model.parent) {
      const indicator = allStructures.find(([, keys]) =>
        keys.includes(object.name),
      );

      if (indicator) {
        onSelect(indicator[0]);
        return;
      }

      object = object.parent;
    }
  };

  // ==========================================================
  // RENDER DEL MODELO
  // ==========================================================

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
      <primitive
        object={model}
        onClick={handleStructureClick}
      />
    </group>
  );
}

// ============================================================
// CONTROL DE ERRORES
// ============================================================

class ViewerBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      failed: false,
    };
  }

  static getDerivedStateFromError() {
    return {
      failed: true,
    };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="viewer-fallback" role="status">
          No se pudo cargar el modelo anatómico.
          Las tarjetas y lecturas siguen disponibles.
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function BodyViewer3D({
  crew,
  indicators,
  latest,
  selected,
  onSelect,
}) {
  const [webglFailed, setWebglFailed] = useState(false);
  const [sex, setSex] = useState('male');

  const controlsRef = useRef();

  const indicatorFor = (id) => indicators?.[id];

  const selectedIndicator = indicatorFor(selected);

  const selectedStatus = selectedIndicator
    ? getStatus(
        selectedIndicator,
        crew,
        latest?.[selected],
      )
    : 'nodata';

  if (webglFailed) {
    return (
      <div className="viewer-fallback" role="status">
        Visor 3D no disponible.
        Las tarjetas y lecturas siguen disponibles.
      </div>
    );
  }

  return (
    <ViewerBoundary>
      <div className="body-viewer">

        {/* ÁREA PRINCIPAL DEL MODELO */}

        <div className="viewer-main">

          {/* SELECTOR DEL MODELO */}

          <div
            className="viewer-model-switch"
            aria-label="Variante anatómica"
          >
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

          <p className="viewer-hint">
            Selecciona un indicador o haz clic sobre un órgano para explorarlo.
          </p>

          {/* VISOR 3D */}

          <div
            className="viewer-canvas"
            role="img"
            aria-label="Modelo anatómico humano 3D interactivo"
          >
            <Canvas
              camera={{
                position: [0, 0, 4],
                fov: 42,
              }}
              dpr={[1, 1.5]}
              fallback={
                <div className="viewer-fallback">
                  WebGL no está disponible.
                </div>
              }
              onCreated={({ gl }) => {
                gl.domElement.addEventListener(
                  'webglcontextlost',
                  (event) => {
                    event.preventDefault();
                    setWebglFailed(true);
                  },
                );
              }}
            >
              <color attach="background" 
              args={['#08111f']} />
              
              <ambientLight intensity={1.1} />

              <directionalLight
                position={[3, 4, 5]}
                intensity={1.6}
              />

              <pointLight
                position={[-3, 1, 2]}
                color="#a4ff70"
                intensity={0.8}
              />

              <Suspense fallback={null}>
                <AnatomyModel
                  sex={sex}
                  selected={selected}
                  selectedStatus={selectedStatus}
                  onSelect={onSelect}
                  controlsRef={controlsRef}
                />
              </Suspense>

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enablePan={false}
                minDistance={0.8}
                maxDistance={8}
                enableDamping
              />
            </Canvas>
          </div>
        </div>

        {/* LEYENDA DE INDICADORES */}

        <div
          className="viewer-legend"
          aria-label="Indicadores de salud"
        >
          {POINTS.map((point) => {
            const indicator = indicatorFor(point.indicatorId);

            if (!indicator) return null;

            const status = getStatus(
              indicator,
              crew,
              latest?.[point.indicatorId],
            );

            return (
              <button
                key={point.indicatorId}
                type="button"
                className={`viewer-point status-${status}${
                  selected === point.indicatorId
                    ? ' selected'
                    : ''
                }`}
                onClick={() => onSelect(point.indicatorId)}
                aria-pressed={
                  selected === point.indicatorId
                }
              >
                <i
                  style={{
                    background:
                      STATUS_COLORS[status] ||
                      STATUS_COLORS.nodata,
                  }}
                />

                {point.name}
              </button>
            );
          })}
        </div>

        {/* ATRIBUCIÓN DEL MODELO */}

        <p className="viewer-attribution">
          {ATTRIBUTION}
        </p>

      </div>
    </ViewerBoundary>
  );
}
