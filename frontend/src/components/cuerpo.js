// cuerpo.js · Medidas de la figura humana (propias), compartidas por la figura 2D (SVG)
// y la 3D (three.js). Unidades del dibujo: 480 x 640, con el eje del cuerpo en x = 240.
export const CX = 240;

// Interpolación lineal sobre una tabla [[y, valor], ...]
export function perfil(tabla, y) {
  if (y < tabla[0][0] || y > tabla.at(-1)[0]) return null;
  for (let i = 1; i < tabla.length; i++) {
    const [y0, v0] = tabla[i - 1];
    const [y1, v1] = tabla[i];
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0 || 1);
  }
  return null;
}

export const TORSO = [[118, 20], [128, 56], [140, 66], [172, 62], [240, 47], [270, 48], [306, 58], [338, 58]];
export const BRAZO_X = [[132, 74], [200, 84], [280, 92], [352, 100], [390, 102]];
export const BRAZO_W = [[132, 9], [150, 13], [230, 11], [330, 8], [352, 8], [366, 11], [390, 4]];
export const PIERNA_X = [[338, 29], [460, 26], [590, 24], [612, 28]];
export const PIERNA_W = [[338, 29], [400, 26], [455, 17], [490, 19], [540, 13], [590, 10], [600, 17], [612, 14]];

// Partes del cuerpo a la altura y: centro, medio ancho y fondo relativo (k = fondo / ancho)
export function partesEn(y) {
  const partes = [];
  const d = (y - 64) / 40;
  if (Math.abs(d) < 1) partes.push({ cx: CX, hw: 31 * Math.sqrt(1 - d * d), k: 1.12 });
  if (y >= 98 && y <= 122) partes.push({ cx: CX, hw: 13, k: 1 });
  const t = perfil(TORSO, y);
  if (t != null) partes.push({ cx: CX, hw: t, k: y < 150 ? 0.5 : 0.58 });
  const bx = perfil(BRAZO_X, y);
  const bw = perfil(BRAZO_W, y);
  if (bx != null && bw != null) { partes.push({ cx: CX - bx, hw: bw, k: 1 }); partes.push({ cx: CX + bx, hw: bw, k: 1 }); }
  const px = perfil(PIERNA_X, y);
  const pw = perfil(PIERNA_W, y);
  if (px != null && pw != null) { const k = y > 592 ? 2.1 : 1.05; partes.push({ cx: CX - px, hw: pw, k, dz: y > 592 ? pw * 0.9 : 0 }); partes.push({ cx: CX + px, hw: pw, k, dz: y > 592 ? pw * 0.9 : 0 }); }
  return partes;
}
