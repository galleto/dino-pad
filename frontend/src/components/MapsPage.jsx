import { useEffect, useRef, useState } from 'react';
import NodeSimulator from './NodeSimulator';
import './MapsPage.css';

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = LEAFLET_CSS_URL;
    stylesheet.dataset.leaflet = 'true';
    stylesheet.onerror = () => reject(new Error('No se pudo cargar el estilo de Leaflet.'));
    stylesheet.onload = () => {
      const script = document.createElement('script');
      script.src = LEAFLET_JS_URL;
      script.async = true;
      script.dataset.leaflet = 'true';
      script.onload = () => {
        if (window.L) resolve(window.L);
        else reject(new Error('Leaflet no estuvo disponible después de cargar.'));
      };
      script.onerror = () => reject(new Error('No se pudo cargar Leaflet.'));
      document.head.appendChild(script);
    };
    document.head.appendChild(stylesheet);
  });

  return leafletPromise;
}

function getYesterday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const MAPS = {
  tierra: {
    label: 'Tierra',
    center: [20, -100],
    zoom: 4,
    attribution: 'NASA GIBS',
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${getYesterday()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    options: { maxNativeZoom: 9 },
  },
  luna: {
    label: 'Luna',
    center: [0, 0],
    zoom: 1,
    attribution: 'NASA/JPL Trek',
    url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
    options: { noWrap: true, maxNativeZoom: 6, maxZoom: 8 },
    crs: true,
  },
  marte: {
    label: 'Marte',
    center: [0, 0],
    zoom: 1,
    attribution: 'NASA/JPL Trek',
    url: 'https://trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
    options: { noWrap: true, maxNativeZoom: 6, maxZoom: 8 },
    crs: true,
  },
};

function MapsPage() {
  const [selectedMap, setSelectedMap] = useState('tierra');
  const [mapError, setMapError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [mapForSimulator, setMapForSimulator] = useState(null);
  const mapElement = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let map;
    const config = MAPS[selectedMap];

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElement.current) return;
        map = L.map(mapElement.current, config.crs ? { crs: L.CRS.EPSG4326 } : {});
        map.setView(config.center, config.zoom);
        L.tileLayer(config.url, {
          attribution: config.attribution,
          ...config.options,
        }).addTo(map);
        setMapForSimulator({ map, body: selectedMap });
        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setMapError(error.message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [selectedMap]);

  return (
    <div className="page-grid maps-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CARTOGRAFÍA PLANETARIA</span>
          <h2>Mapas</h2>
          <p>Explora imágenes satelitales de la Tierra, la Luna y Marte.</p>
        </div>
      </div>
      <section className="panel maps-panel" aria-label="Mapas planetarios">
        <div className="maps-controls" aria-label="Seleccionar cuerpo celeste">
          {Object.entries(MAPS).map(([id, config]) => (
            <button
              key={id}
              className={`button${selectedMap === id ? ' button-primary' : ''}`}
              type="button"
              onClick={() => {
                if (selectedMap !== id) {
                  setSelectedMap(id);
                  setMapError('');
                  setIsLoading(true);
                }
              }}
              aria-pressed={selectedMap === id}
            >
              {config.label}
            </button>
          ))}
        </div>
        <div className="maps-view">
          <div
            ref={mapElement}
            className="maps-map"
            role="region"
            aria-label={`Mapa de ${MAPS[selectedMap].label}`}
          />
          <NodeSimulator
            map={mapForSimulator?.body === selectedMap ? mapForSimulator.map : null}
            body={selectedMap}
          />
          {isLoading && <p className="maps-message" role="status">Cargando mapa…</p>}
          {mapError && <p className="maps-message maps-error" role="alert">{mapError}</p>}
        </div>
        <p className="maps-attribution">Atribución: {MAPS[selectedMap].attribution}</p>
      </section>
    </div>
  );
}

export default MapsPage;
