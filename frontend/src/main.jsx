import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DataProvider } from './hooks/DataContext.jsx'

function notifyPwa(type) {
  window.dispatchEvent(new CustomEvent(`dinopad-${type}`))
}

async function unregisterLocalDinopadWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const appScope = new URL('./', window.location.href).href
    await Promise.all(registrations.map(async (registration) => {
      const scriptUrl = registration.active?.scriptURL
        || registration.waiting?.scriptURL
        || registration.installing?.scriptURL
      if (!scriptUrl || registration.scope !== appScope) return
      const workerUrl = new URL(scriptUrl)
      if (workerUrl.href === new URL('sw.js', appScope).href) {
        await registration.unregister()
      }
    }))
    const oldCaches = await caches.keys()
    await Promise.all(oldCaches
      .filter((name) => name.startsWith('dinopad-shell-'))
      .map((name) => caches.delete(name)))
  } catch {
    notifyPwa('pwa-error')
  }
}

async function registerProductionWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    const notifyWhenUpdated = (worker) => {
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          notifyPwa('update-available')
        }
      })
    }
    if (registration.waiting && navigator.serviceWorker.controller) {
      notifyPwa('update-available')
    }
    registration.addEventListener('updatefound', () => notifyWhenUpdated(registration.installing))
  } catch {
    notifyPwa('pwa-error')
  }
}

if (import.meta.env.PROD) {
  window.addEventListener('load', registerProductionWorker, { once: true })
} else {
  void unregisterLocalDinopadWorker()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
)
