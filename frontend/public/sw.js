const CACHE_NAME = 'dinopad-shell-v1';
const SCOPE_URL = self.registration.scope;
const APP_ROOT = new URL('./', SCOPE_URL);

async function precacheShell(cache) {
  const response = await fetch(APP_ROOT.href);
  if (!response.ok) throw new Error('No se pudo guardar la aplicación para uso sin conexión.');
  await cache.put(APP_ROOT.href, response.clone());
  const manifestUrl = new URL('.vite/manifest.json', SCOPE_URL);
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) throw new Error('No se pudo leer el manifiesto de recursos de la aplicación.');
  const manifest = await manifestResponse.clone().json();
  const files = new Set(Object.values(manifest).flatMap((entry) => [
    entry.file,
    ...(entry.css || []),
    ...(entry.assets || []),
  ]).filter((file) => typeof file === 'string'));
  await Promise.all([...files].map(async (file) => {
    const assetUrl = new URL(file, new URL('./', SCOPE_URL));
    const assetResponse = await fetch(assetUrl);
    if (assetResponse.ok) await cache.put(assetUrl, assetResponse);
  }));
  await cache.put(manifestUrl, manifestResponse);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.delete(CACHE_NAME).then(() => caches.open(CACHE_NAME)).then(async (cache) => {
      await Promise.all([
        new URL('manifest.webmanifest', SCOPE_URL).href,
        new URL('icons/icon-192.png', SCOPE_URL).href,
        new URL('icons/icon-512.png', SCOPE_URL).href,
        new URL('icons/icon.svg', SCOPE_URL).href,
      ].map((assetUrl) => cache.add(assetUrl)));
      await precacheShell(cache);
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('dinopad-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isExcludedPath(pathname) {
  return pathname === '/health'
    || pathname.startsWith('/health/')
    || pathname === '/api'
    || pathname.startsWith('/api/');
}

function isStaticAsset(request, url) {
  return ['script', 'style', 'image', 'font'].includes(request.destination)
    || url.pathname.includes('/assets/')
    || url.pathname.includes('/icons/')
    || url.pathname.endsWith('/manifest.webmanifest')
    || url.pathname.endsWith('/favicon.svg');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isExcludedPath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(APP_ROOT.href, response.clone());
        return response;
      } catch {
        return (await cache.match(new URL('index.html', SCOPE_URL)))
          || (await cache.match(APP_ROOT.href))
          || Response.error();
      }
    })());
    return;
  }

  if (!isStaticAsset(request, url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => undefined));
      return cached;
    }
    return refresh;
  })());
});
