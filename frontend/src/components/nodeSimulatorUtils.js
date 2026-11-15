export const EARTH_RADIUS_KM = 6371;

export const BODY_RADII_KM = {
  tierra: 6371,
  luna: 1737.4,
  marte: 3389.5,
};

export const ENVIRONMENT_FACTORS = {
  ciudad: { label: 'Ciudad', factor: 0.5 },
  despejado: { label: 'Despejado', factor: 1 },
  lunaSinAtmosfera: { label: 'Luna sin atmósfera', factor: 1.5 },
};

const SAMPLE_NODES = {
  tierra: [
    { id: 'tierra-demo-1', name: 'Astronauta 1', type: 'astronauta', lat: 20, lng: -100, radiusMeters: 1000 },
    { id: 'tierra-demo-2', name: 'SenseCAP Tracker 1', type: 'sensecap', lat: 20.004, lng: -100.002, radiusMeters: 1000 },
    { id: 'tierra-demo-3', name: 'Astronauta 2', type: 'astronauta', lat: 20.08, lng: -100.02, radiusMeters: 1000 },
  ],
  luna: [
    { id: 'luna-demo-1', name: 'Astronauta 1', type: 'astronauta', lat: 0, lng: 0, radiusMeters: 1000 },
    { id: 'luna-demo-2', name: 'SenseCAP Tracker 1', type: 'sensecap', lat: 0.004, lng: 0.002, radiusMeters: 1000 },
    { id: 'luna-demo-3', name: 'Astronauta 2', type: 'astronauta', lat: 0.08, lng: 0.02, radiusMeters: 1000 },
  ],
  marte: [
    { id: 'marte-demo-1', name: 'Astronauta 1', type: 'astronauta', lat: 0, lng: 0, radiusMeters: 1000 },
    { id: 'marte-demo-2', name: 'SenseCAP Tracker 1', type: 'sensecap', lat: 0.004, lng: 0.002, radiusMeters: 1000 },
    { id: 'marte-demo-3', name: 'Astronauta 2', type: 'astronauta', lat: 0.08, lng: 0.02, radiusMeters: 1000 },
  ],
};

export function obtenerPosicionesNodos() {
  return Object.fromEntries(
    Object.entries(SAMPLE_NODES).map(([body, nodes]) => [body, nodes.map((node) => ({ ...node }))]),
  );
}

export function distanciaMetros(first, second, body) {
  const radiusMeters = BODY_RADII_KM[body] * 1000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return radiusMeters * centralAngle;
}

export function obtenerConexiones(nodes, body, environmentFactor) {
  const connections = [];
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      const distance = distanciaMetros(first, second, body);
      const firstRange = first.radiusMeters * environmentFactor;
      const secondRange = second.radiusMeters * environmentFactor;
      if (distance <= firstRange || distance <= secondRange) {
        connections.push({ firstId: first.id, secondId: second.id, distance });
      }
    }
  }
  return connections;
}

export function obtenerGruposNodos(nodes, connections) {
  const neighbors = new Map(nodes.map((node) => [node.id, []]));
  connections.forEach(({ firstId, secondId }) => {
    neighbors.get(firstId)?.push(secondId);
    neighbors.get(secondId)?.push(firstId);
  });

  const visited = new Set();
  const groups = [];
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const group = [];
    const pending = [node.id];
    visited.add(node.id);
    while (pending.length) {
      const currentId = pending.pop();
      group.push(currentId);
      (neighbors.get(currentId) || []).forEach((neighborId) => {
        if (visited.has(neighborId)) return;
        visited.add(neighborId);
        pending.push(neighborId);
      });
    }
    groups.push(group);
  });
  return groups;
}

function unirPoligonos(turf, features) {
  if (!features.length) return null;
  if (features.length === 1) return features[0];
  return turf.union(turf.featureCollection(features));
}

export function analizarAreas(turf, nodes, body, environmentFactor) {
  const bodyRadius = BODY_RADII_KM[body];
  const areaScale = (bodyRadius / EARTH_RADIUS_KM) ** 2;
  const circleFeatures = nodes.map((node) => {
    const equivalentRadiusKm = (node.radiusMeters * environmentFactor * EARTH_RADIUS_KM) / bodyRadius / 1000;
    return turf.circle([node.lng, node.lat], equivalentRadiusKm, { steps: 64, units: 'kilometers' });
  });
  const unionFeature = unirPoligonos(turf, circleFeatures);
  const overlapParts = [];

  for (let firstIndex = 0; firstIndex < circleFeatures.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < circleFeatures.length; secondIndex += 1) {
      const intersection = turf.intersect(turf.featureCollection([
        circleFeatures[firstIndex],
        circleFeatures[secondIndex],
      ]));
      if (intersection) overlapParts.push(intersection);
    }
  }

  const overlapFeature = unirPoligonos(turf, overlapParts);
  const sumAreaSquareMeters = circleFeatures.reduce((sum, feature) => sum + turf.area(feature), 0) * areaScale;
  const unionAreaSquareMeters = unionFeature ? turf.area(unionFeature) * areaScale : 0;
  const overlapPercent = sumAreaSquareMeters
    ? Math.max(0, Math.min(100, ((sumAreaSquareMeters - unionAreaSquareMeters) / sumAreaSquareMeters) * 100))
    : 0;

  return {
    circleFeatures,
    unionFeature,
    overlapFeature,
    sumAreaSquareMeters,
    unionAreaSquareMeters,
    overlapPercent,
  };
}
