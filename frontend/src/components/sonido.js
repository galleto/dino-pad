// sonido.js · Sonidos de interfaz generados por código (Web Audio), sin audio de terceros.
// Apagados por defecto: solo suenan si la persona los activa.
import { sonidoStore } from './estadoMision';

let ctx = null;
const TONOS = {
  clic: [[880, 0, 0.04]],
  ok: [[660, 0, 0.07], [990, 0.07, 0.09]],
  alarma: [[440, 0, 0.18], [330, 0.2, 0.18], [440, 0.4, 0.18], [330, 0.6, 0.22]],
};

export function sonar(nombre) {
  if (!sonidoStore.get()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    (TONOS[nombre] || TONOS.clic).forEach(([frec, inicio, dur]) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = frec;
      gan.gain.setValueAtTime(0.04, ctx.currentTime + inicio);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + dur);
    });
  } catch { /* sin audio: se ignora */ }
}
