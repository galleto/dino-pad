import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analizarAreas,
  BODY_RADII_KM,
  distanciaMetros,
  ENVIRONMENT_FACTORS,
  obtenerConexiones,
  obtenerGruposNodos,
  obtenerPosicionesNodos,
} from './nodeSimulatorUtils';
import './NodeSimulator.css';

const TURF_URL = 'https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js';
const EMPTY_NODES = Object.freeze([]);
let turfPromise;

function loadTurf() {
  if (window.turf) return Promise.resolve(window.turf);
  if (turfPromise) return turfPromise;

  turfPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURF_URL;
    script.async = true;
    script.dataset.turf = 'true';
    script.onload = () => {
      if (window.turf) resolve(window.turf);
      else reject(new Error('Turf no estuvo disponible después de cargar.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar Turf desde el CDN.'));
    document.head.appendChild(script);
  });
  return turfPromise;
}

function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} km`
    : `${Math.round(meters).toLocaleString('es')} m`;
}

function formatArea(squareMeters) {
  return `${(squareMeters / 1_000_000).toLocaleString('es', { maximumFractionDigits: 3 })} km²`;
}

function NodeSimulator({ map, body }) {
  const [nodesByBody, setNodesByBody] = useState(obtenerPosicionesNodos);
  const [selectedByBody, setSelectedByBody] = useState({});
  const [globalRadii, setGlobalRadii] = useState({ tierra: 1000, luna: 1000, marte: 1000 });
  const [environment, setEnvironment] = useState('despejado');
  const [newNodeType, setNewNodeType] = useState('astronauta');
  const [turf, setTurf] = useState(null);
  const [turfError, setTurfError] = useState('');
  const panelElement = useRef(null);
  const nameSequence = useRef({ tierra: 4, luna: 4, marte: 4 });
  const nodes = nodesByBody[body] || EMPTY_NODES;
  const selectedNodeId = selectedByBody[body] || nodes[0]?.id || null;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const environmentFactor = ENVIRONMENT_FACTORS[environment].factor;

  useEffect(() => {
    let cancelled = false;
    loadTurf()
      .then((loadedTurf) => {
        if (!cancelled) setTurf(loadedTurf);
      })
      .catch((error) => {
        if (!cancelled) setTurfError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connections = useMemo(
    () => obtenerConexiones(nodes, body, environmentFactor),
    [nodes, body, environmentFactor],
  );
  const groups = useMemo(() => obtenerGruposNodos(nodes, connections), [nodes, connections]);
  const analysis = useMemo(() => {
    if (!turf) return null;
    try {
      return analizarAreas(turf, nodes, body, environmentFactor);
    } catch (error) {
      return { error: error.message };
    }
  }, [turf, nodes, body, environmentFactor]);

  useEffect(() => {
    if (!map || !window.L) return undefined;
    const onMapClick = (event) => {
      const sequence = nameSequence.current[body];
      nameSequence.current[body] += 1;
      const node = {
        id: `${body}-${Date.now()}-${sequence}`,
        name: newNodeType === 'sensecap' ? `SenseCAP Tracker ${sequence}` : `Astronauta ${sequence}`,
        type: newNodeType,
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        radiusMeters: globalRadii[body],
      };
      setNodesByBody((previous) => ({ ...previous, [body]: [...(previous[body] || []), node] }));
      setSelectedByBody((previous) => ({ ...previous, [body]: node.id }));
    };
    map.on('click', onMapClick);
    return () => map.off('click', onMapClick);
  }, [map, body, newNodeType, globalRadii]);

  useEffect(() => {
    if (!map || !window.L) return undefined;
    const L = window.L;
    const layerGroup = L.layerGroup().addTo(map);

    if (analysis && !analysis.error) {
      if (analysis.unionFeature) {
        L.geoJSON(analysis.unionFeature, {
          style: { color: '#5aa9ff', weight: 1, fillColor: '#5aa9ff', fillOpacity: 0.2 },
        }).addTo(layerGroup);
      }
      analysis.circleFeatures.forEach((feature) => {
        L.geoJSON(feature, {
          style: { color: '#8ac5ff', weight: 1, fillColor: '#5aa9ff', fillOpacity: 0.035 },
        }).addTo(layerGroup);
      });
      if (analysis.overlapFeature) {
        L.geoJSON(analysis.overlapFeature, {
          style: { color: '#c4e3ff', weight: 1, fillColor: '#8ac5ff', fillOpacity: 0.48 },
        }).addTo(layerGroup);
      }
    }

    connections.forEach(({ firstId, secondId }) => {
      const first = nodes.find((node) => node.id === firstId);
      const second = nodes.find((node) => node.id === secondId);
      if (first && second) {
        L.polyline([[first.lat, first.lng], [second.lat, second.lng]], {
          color: '#5fd3a0',
          weight: 2,
          opacity: 0.85,
        }).addTo(layerGroup);
      }
    });

    nodes.forEach((node) => {
      const icon = L.divIcon({
        className: 'node-sim-icon',
        html: `<span class="node-sim-marker node-sim-marker-${node.type}">${node.type === 'sensecap' ? 'S' : 'A'}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([node.lat, node.lng], { draggable: true, icon }).addTo(layerGroup);
      const tooltip = document.createElement('span');
      tooltip.textContent = node.name;
      marker.bindTooltip(tooltip);
      marker.on('click', () => setSelectedByBody((previous) => ({ ...previous, [body]: node.id })));
      marker.on('dragend', (event) => {
        const position = event.target.getLatLng();
        setNodesByBody((previous) => ({
          ...previous,
          [body]: (previous[body] || []).map((item) => (
            item.id === node.id ? { ...item, lat: position.lat, lng: position.lng } : item
          )),
        }));
      });
    });

    return () => layerGroup.remove();
  }, [map, body, nodes, connections, analysis]);

  useEffect(() => {
    if (!map || !window.L || !panelElement.current) return undefined;
    window.L.DomEvent.disableClickPropagation(panelElement.current);
    window.L.DomEvent.disableScrollPropagation(panelElement.current);
    return undefined;
  }, [map]);

  const changeGlobalRadius = (value) => {
    setGlobalRadii((previous) => ({ ...previous, [body]: value }));
    setNodesByBody((previous) => ({
      ...previous,
      [body]: (previous[body] || []).map((node) => ({ ...node, radiusMeters: value })),
    }));
  };

  const updateNode = (nodeId, changes) => {
    setNodesByBody((previous) => ({
      ...previous,
      [body]: (previous[body] || []).map((node) => (
        node.id === nodeId ? { ...node, ...changes } : node
      )),
    }));
  };

  const removeNode = (nodeId) => {
    const remaining = nodes.filter((node) => node.id !== nodeId);
    setNodesByBody((previous) => ({ ...previous, [body]: remaining }));
    if (selectedNodeId === nodeId) {
      setSelectedByBody((previous) => ({ ...previous, [body]: remaining[0]?.id || null }));
    }
  };

  const connectedGroups = groups.filter((group) => group.length > 1);
  const isolatedIds = new Set(groups.filter((group) => group.length === 1).flat());
  const selectedConnections = new Set(
    connections.flatMap(({ firstId, secondId }) => {
      if (firstId === selectedNodeId) return [secondId];
      if (secondId === selectedNodeId) return [firstId];
      return [];
    }),
  );

  return (
    <aside ref={panelElement} className="node-sim-panel" aria-label="Simulador de nodos">
      <header className="node-sim-heading">
        <div>
          <span className="eyebrow">RED DE COMUNICACIÓN</span>
          <h3>Simulador de nodos</h3>
        </div>
        <span className="tag tag-simulated">VALORES SIMULADOS</span>
      </header>
      <div className="node-sim-controls">
        <label>
          <span>Radio de todos los nodos <strong>{formatDistance(globalRadii[body])}</strong></span>
          <input
            type="range"
            min="50"
            max="10000"
            step="50"
            value={globalRadii[body]}
            onChange={(event) => changeGlobalRadius(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Entorno <small>valores simulados</small></span>
          <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
            {Object.entries(ENVIRONMENT_FACTORS).map(([id, option]) => (
              <option key={id} value={id}>{option.label} ×{option.factor}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Nuevo nodo</span>
          <select value={newNodeType} onChange={(event) => setNewNodeType(event.target.value)}>
            <option value="astronauta">Astronauta</option>
            <option value="sensecap">SenseCAP Tracker</option>
          </select>
        </label>
        <p className="node-sim-hint">Haz clic en el mapa para agregar un nodo.</p>
      </div>

      <div className="node-sim-metrics">
        <div><small>Suma simple</small><strong>{analysis ? formatArea(analysis.sumAreaSquareMeters || 0) : 'Calculando…'}</strong></div>
        <div className="node-sim-union"><small>ÁREA UNIDA</small><strong>{analysis ? formatArea(analysis.unionAreaSquareMeters || 0) : 'Calculando…'}</strong></div>
        <div><small>Traslape</small><strong>{analysis ? `${(analysis.overlapPercent || 0).toLocaleString('es', { maximumFractionDigits: 1 })}%` : '—'}</strong></div>
      </div>
      {turfError && <p className="node-sim-error" role="alert">{turfError}</p>}
      {analysis?.error && <p className="node-sim-error" role="alert">No se pudieron calcular las áreas: {analysis.error}</p>}
      {!turf && !turfError && <p className="node-sim-hint" role="status">Cargando cálculo geográfico…</p>}

      <section className="node-sim-network" aria-label="Estado de la red">
        <div className="node-sim-section-title"><strong>Grupos conectados</strong><span>{connectedGroups.length} mallas · {isolatedIds.size} aislados</span></div>
        {connectedGroups.length ? connectedGroups.map((group, index) => (
          <p key={group.join('-')}>Malla {index + 1}: {group.map((id) => nodes.find((node) => node.id === id)?.name).filter(Boolean).join(' · ')}</p>
        )) : <p>No hay grupos de varios nodos.</p>}
        {isolatedIds.size > 0 && <p>Aislados: {nodes.filter((node) => isolatedIds.has(node.id)).map((node) => node.name).join(' · ')}</p>}
      </section>

      <section className="node-sim-list" aria-label="Lista de nodos">
        <div className="node-sim-section-title"><strong>Nodos · {nodes.length}</strong><span>Rango efectivo ×{environmentFactor}</span></div>
        {nodes.length === 0 && <p className="node-sim-hint">Agrega nodos haciendo clic en el mapa.</p>}
        {nodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const distance = selectedNode && !isSelected ? distanciaMetros(selectedNode, node, body) : 0;
          const isConnected = selectedConnections.has(node.id);
          const effectiveRadius = node.radiusMeters * environmentFactor;
          return (
            <article key={node.id} className={`node-sim-card${isSelected ? ' is-selected' : ''}`}>
              <button
                type="button"
                className="node-sim-select"
                onClick={() => setSelectedByBody((previous) => ({ ...previous, [body]: node.id }))}
                aria-pressed={isSelected}
              >
                <span className={`node-sim-avatar node-sim-avatar-${node.type}`}>{node.type === 'sensecap' ? 'S' : 'A'}</span>
                <span><strong>{node.name}</strong><small>{node.type === 'sensecap' ? 'SenseCAP Tracker' : 'Astronauta'}</small></span>
                <span className={`node-sim-status${isSelected || isConnected ? ' is-connected' : ''}`}>
                  {isSelected ? 'Seleccionado' : isConnected ? 'Conectado' : 'Fuera de rango'}
                </span>
              </button>
              <label className="node-sim-field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={node.name}
                  maxLength="50"
                  aria-label={`Nombre de ${node.name}`}
                  onChange={(event) => updateNode(node.id, { name: event.target.value })}
                />
              </label>
              <label className="node-sim-field">
                <span>Tipo</span>
                <select
                  value={node.type}
                  aria-label={`Tipo de ${node.name}`}
                  onChange={(event) => updateNode(node.id, { type: event.target.value })}
                >
                  <option value="astronauta">Astronauta</option>
                  <option value="sensecap">SenseCAP Tracker</option>
                </select>
              </label>
              <label className="node-sim-field">
                <span>Radio propio: {formatDistance(node.radiusMeters)}</span>
                <input
                  type="range"
                  min="50"
                  max="10000"
                  step="50"
                  value={node.radiusMeters}
                  aria-label={`Radio de ${node.name}`}
                  onChange={(event) => updateNode(node.id, { radiusMeters: Number(event.target.value) })}
                />
              </label>
              <div className="node-sim-card-footer">
                <span>Alcance efectivo {formatDistance(effectiveRadius)}</span>
                <span>{isSelected ? 'Nodo de referencia' : `Distancia ${formatDistance(distance)}`}</span>
              </div>
              <button type="button" className="node-sim-remove" onClick={() => removeNode(node.id)}>Eliminar nodo</button>
            </article>
          );
        })}
      </section>
      <p className="node-sim-footnote">Radio de {BODY_RADII_KM[body].toLocaleString('es')} km · posiciones locales de ejemplo</p>
    </aside>
  );
}

export default NodeSimulator;
