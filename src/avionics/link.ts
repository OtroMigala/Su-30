// Enlace de datos: ecuación de Friis, balance de enlace y horizonte radio.
//
// Valores ILUSTRATIVOS de un enlace de datos en banda L (como Link 16, 960–1215 MHz).

import { C } from './radar';

export const LINK = {
  freq: 1.0e9, // Hz
  ptDbm: 53, // 200 W
  gtDbi: 3, // antena del avión
  grDbi: 6, // antena de la torre
  sensitivityDbm: -100, // potencia mínima que el receptor decodifica
  lossesDb: 3, // cables, polarización...
};

/**
 * Pérdidas de trayecto en espacio libre (dB): FSPL = 20·log₁₀(4π·d·f / c).
 * Sale de la ecuación de Friis, Pr/Pt = Gt·Gr·(λ / 4πd)²: la potencia se reparte en una esfera
 * (∝ 1/d²) y la antena receptora capta un área efectiva ∝ λ². Cada vez que se duplica la distancia
 * se pierden 6 dB (no 12 como en el radar, que recorre el camino dos veces).
 */
export function fsplDb(distance: number, freq = LINK.freq) {
  return 20 * Math.log10((4 * Math.PI * distance * freq) / C);
}

/** Balance de enlace: potencia recibida y margen sobre la sensibilidad (dBm, dB). */
export function linkBudget(distance: number, l = LINK) {
  const fspl = fsplDb(distance, l.freq);
  const prDbm = l.ptDbm + l.gtDbi + l.grDbi - l.lossesDb - fspl;
  return { fspl, prDbm, marginDb: prDbm - l.sensitivityDbm };
}

/**
 * Horizonte radio (km) entre dos antenas a alturas h1 y h2 (m): d ≈ 4.12·(√h1 + √h2).
 * La Tierra es curva y tapa la línea de vista; el 4.12 (en lugar del 3.57 geométrico) incluye la
 * refracción atmosférica estándar, que curva un poco las ondas hacia abajo (radio terrestre "4/3").
 */
export function radioHorizonKm(h1: number, h2: number) {
  return 4.12 * (Math.sqrt(Math.max(h1, 0)) + Math.sqrt(Math.max(h2, 0)));
}
