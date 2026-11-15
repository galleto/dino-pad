import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Límite de tamaño por bloque.
// El visor corporal 3D (three.js, src/components/BodyViewer3D.jsx) es OPCIONAL
// ("Vista 3D") y se carga con import dinámico solo cuando se pide: su bloque
// minificado pesa ~943 kB. El aviso global de Vite se sube a 1000 kB SOLO por ese
// bloque; para los demás se mantiene el límite normal de 500 kB con el plugin de abajo.
const LIMITE_KB = 500
const BLOQUES_PERMITIDOS = [/^BodyViewer3D/]

function limitePorBloque() {
  return {
    name: 'dinopad-limite-por-bloque',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue
        const kb = item.code.length / 1000
        const permitido = BLOQUES_PERMITIDOS.some((re) => re.test(item.name || ''))
        if (!permitido && kb > LIMITE_KB) {
          this.warn(`El bloque ${item.fileName} pesa ${kb.toFixed(0)} kB (más de ${LIMITE_KB} kB).`)
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), limitePorBloque()],
  base: './',
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1000,
  },
})
