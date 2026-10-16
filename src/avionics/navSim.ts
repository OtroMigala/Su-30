// Simulación de navegación: un GPS ruidoso y un filtro de Kalman que lo fusiona (página NAV).
//
// La "verdad" es la posición del avión sobre el suelo (rig.flight.x/z). Cada segundo llega una
// medida GPS = verdad + ruido gaussiano de σ = 15 m por eje. El filtro predice a 10 Hz y corrige
// con cada medida. Se guardan los errores (medida − verdad y estimación − verdad) de los últimos
// 60 s para dibujarlos y calcular su RMS.

import { rng } from '../scene/random';
import { createKalman1D, gaussian, predict, update, type Kalman1D } from './kalman';

export const GPS_SIGMA = 15; // m
const GPS_PERIOD = 1; // s
/** Densidad de ruido de aceleración ((m/s²)²·s): cuánto puede "sorprender" el avión al modelo
 *  de velocidad constante. Más alta sigue mejor los giros; más baja suaviza más el ruido. */
const Q = 4;
const HISTORY = 60;

export interface NavSim {
  kx: Kalman1D;
  kz: Kalman1D;
  rand: () => number;
  sinceGps: number;
  /** Errores recientes (m): [ex, ez] del GPS y del filtro. */
  gpsErr: [number, number][];
  kfErr: [number, number][];
  started: boolean;
}

export function createNavSim(): NavSim {
  return { kx: createKalman1D(0), kz: createKalman1D(0), rand: rng(2026), sinceGps: 0, gpsErr: [], kfErr: [], started: false };
}

export function stepNavSim(s: NavSim, x: number, z: number, dt: number) {
  // Arranque o salto grande (p. ej. un traspaso o un vuelo rápido por el menú): reiniciar.
  if (!s.started || Math.hypot(s.kx.p - x, s.kz.p - z) > 800) {
    s.kx = createKalman1D(x);
    s.kz = createKalman1D(z);
    s.gpsErr = [];
    s.kfErr = [];
    s.started = true;
  }
  predict(s.kx, dt, Q);
  predict(s.kz, dt, Q);
  s.sinceGps += dt;
  if (s.sinceGps >= GPS_PERIOD) {
    s.sinceGps = 0;
    const gx = x + GPS_SIGMA * gaussian(s.rand), gz = z + GPS_SIGMA * gaussian(s.rand);
    update(s.kx, gx, GPS_SIGMA ** 2);
    update(s.kz, gz, GPS_SIGMA ** 2);
    s.gpsErr.push([gx - x, gz - z]);
    s.kfErr.push([s.kx.p - x, s.kz.p - z]);
    if (s.gpsErr.length > HISTORY) {
      s.gpsErr.shift();
      s.kfErr.shift();
    }
  }
}

/** Error cuadrático medio (m) de una lista de errores 2D. */
export function rms(errs: [number, number][]) {
  if (!errs.length) return 0;
  return Math.sqrt(errs.reduce((acc, [a, b]) => acc + a * a + b * b, 0) / errs.length);
}
