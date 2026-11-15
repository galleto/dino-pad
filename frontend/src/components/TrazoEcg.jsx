// TrazoEcg.jsx · Trazo tipo ECG dibujado en canvas al ritmo de la frecuencia cardíaca.
// Es una forma de onda ILUSTRATIVA generada por código: no es un electrocardiograma y
// siempre se rotula DEMO, aunque la frecuencia venga de una lectura real.
import { useEffect, useRef } from 'react';

// Forma P-QRS-T aproximada con campanas; fase 0..1 de un latido
function onda(f) {
  const g = (c, ancho, alto) => alto * Math.exp(-(((f - c) / ancho) ** 2));
  return g(0.18, 0.035, 0.12) - g(0.345, 0.012, 0.16) + g(0.37, 0.014, 1) - g(0.4, 0.014, 0.26) + g(0.62, 0.06, 0.24);
}

export default function TrazoEcg({ bpm, status = 'ok' }) {
  const ref = useRef(null);
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)');
    const color = getComputedStyle(canvas).color;
    let raf = 0;
    let w = 0;
    let h = 0;
    let x = 0;
    let fase = 0;
    let previo = 0;
    let yPrevio = null;
    const VEL = 110;   // px por segundo

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      x = 0; yPrevio = null;
      if (reducir.matches) fijo();
    };
    const yDe = (f) => h * 0.72 - onda(f) * h * 0.6;
    const estilo = () => { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 6; };
    // Con movimiento reducido: tres latidos quietos
    const fijo = () => {
      ctx.clearRect(0, 0, w, h); estilo(); ctx.beginPath();
      for (let px = 0; px <= w; px += 1) { const yy = yDe(((px / w) * 3) % 1); if (px) ctx.lineTo(px, yy); else ctx.moveTo(px, yy); }
      ctx.stroke();
    };
    const cuadro = (t) => {
      raf = requestAnimationFrame(cuadro);
      const dt = previo ? Math.min(0.05, (t - previo) / 1000) : 0.016;
      previo = t;
      const lpm = Number(bpmRef.current) > 0 ? Math.min(220, Math.max(30, Number(bpmRef.current))) : 0;
      const pasos = Math.max(1, Math.round(VEL * dt));
      estilo();
      for (let i = 0; i < pasos; i++) {
        fase = (fase + ((lpm / 60) * dt) / pasos) % 1;
        const nx = x + (VEL * dt) / pasos;
        const ny = lpm ? yDe(fase) : h * 0.72;
        ctx.shadowBlur = 0; ctx.clearRect(nx, 0, 22, h); ctx.shadowBlur = 6;
        if (yPrevio !== null && nx > x) { ctx.beginPath(); ctx.moveTo(x, yPrevio); ctx.lineTo(nx, ny); ctx.stroke(); }
        x = nx; yPrevio = ny;
        if (x >= w) { x = 0; yPrevio = null; }
      }
    };
    const iniciar = () => { cancelAnimationFrame(raf); previo = 0; if (reducir.matches) fijo(); else raf = requestAnimationFrame(cuadro); };
    ajustar(); iniciar();
    window.addEventListener('resize', ajustar);
    reducir.addEventListener('change', iniciar);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', ajustar); reducir.removeEventListener('change', iniciar); };
  }, [status]);
  return <canvas ref={ref} className={`trazo-ecg st-${status}`} role="img" aria-label={`Trazo ilustrativo al ritmo de ${bpm || 'sin dato de'} latidos por minuto. No es un electrocardiograma.`} />;
}
