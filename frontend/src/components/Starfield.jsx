// Starfield.jsx · Fondo de campo estelar en canvas (decorativo, aria-hidden).
// Ligero: unas 200 estrellas en 3 capas de paralaje, a lo sumo 60 fps.
// Se detiene con la pestaña oculta y queda fijo con prefers-reduced-motion.
import { useEffect, useRef } from 'react';

const CAPAS = [
  { n: 110, vel: 0.006, tam: [0.4, 0.9], alfa: [0.25, 0.55] },
  { n: 60, vel: 0.014, tam: [0.7, 1.3], alfa: [0.35, 0.75] },
  { n: 22, vel: 0.03, tam: [1.1, 1.8], alfa: [0.55, 0.95] },
];

function crearEstrellas(w, h) {
  const estrellas = [];
  CAPAS.forEach((capa, c) => {
    const escala = (w * h) / (1600 * 900);
    const n = Math.round(capa.n * Math.min(1.4, Math.max(0.35, escala)));
    for (let i = 0; i < n; i++) {
      estrellas.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: capa.tam[0] + Math.random() * (capa.tam[1] - capa.tam[0]),
        a: capa.alfa[0] + Math.random() * (capa.alfa[1] - capa.alfa[0]),
        fase: Math.random() * Math.PI * 2,
        vel: capa.vel,
        capa: c,
        // Unas pocas estrellas con tinte cian o violeta
        tinte: Math.random() < 0.12 ? (Math.random() < 0.5 ? '160,235,255' : '190,175,255') : '230,238,250',
      });
    }
  });
  return estrellas;
}

export default function Starfield() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0;
    let h = 0;
    let estrellas = [];
    let raf = 0;
    let ultimo = 0;

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      estrellas = crearEstrellas(w, h);
    };

    const dibujar = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of estrellas) {
        const brillo = reducir.matches ? s.a : s.a * (0.75 + 0.25 * Math.sin(t * 0.0012 + s.fase));
        ctx.fillStyle = `rgba(${s.tinte},${brillo.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const cuadro = (t) => {
      raf = requestAnimationFrame(cuadro);
      const dt = ultimo ? Math.min(t - ultimo, 64) : 16;
      ultimo = t;
      for (const s of estrellas) {
        s.x -= s.vel * dt;
        if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h; }
      }
      dibujar(t);
    };

    const iniciar = () => {
      cancelAnimationFrame(raf);
      ultimo = 0;
      if (reducir.matches || document.hidden) dibujar(0);
      else raf = requestAnimationFrame(cuadro);
    };

    ajustar();
    iniciar();
    const alRedimensionar = () => { ajustar(); iniciar(); };
    window.addEventListener('resize', alRedimensionar);
    document.addEventListener('visibilitychange', iniciar);
    reducir.addEventListener('change', iniciar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', alRedimensionar);
      document.removeEventListener('visibilitychange', iniciar);
      reducir.removeEventListener('change', iniciar);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
