// Filtro de Kalman 2D de velocidad constante, para fusionar posiciones GPS ruidosas.
//
// Estado x = [px, py, vx, vy] (m, m/s). Por eje, el modelo es independiente, así que se usan dos
// filtros 1D de dos estados (posición, velocidad): mismas ecuaciones, matrices de 2×2 escritas a mano.
//
// Las cuatro ideas:
//  1. PREDICCIÓN: x ← F·x con F = [[1, dt], [0, 1]] (la posición avanza v·dt). La incertidumbre
//     crece: P ← F·P·Fᵀ + Q, donde Q modela aceleraciones que el modelo no conoce.
//  2. MEDIDA: el GPS da la posición z con varianza R. La innovación y = z − H·x (H = [1, 0]).
//  3. GANANCIA de Kalman K = P·Hᵀ / (H·P·Hᵀ + R): cuánto creer a la medida frente a la predicción.
//     Si el GPS es muy ruidoso (R grande), K pequeña; si la predicción es incierta, K grande.
//  4. CORRECCIÓN: x ← x + K·y, P ← (I − K·H)·P.
// Es el estimador óptimo (mínima varianza) para sistemas lineales con ruido gaussiano.

export interface Kalman1D {
  p: number; // posición estimada
  v: number; // velocidad estimada
  // Covarianza simétrica [[a, b], [b, c]]
  a: number;
  b: number;
  c: number;
}

export function createKalman1D(p0: number, v0 = 0, posVar = 100, velVar = 400): Kalman1D {
  return { p: p0, v: v0, a: posVar, b: 0, c: velVar };
}

/**
 * Predicción con modelo de velocidad constante y ruido de aceleración blanco de densidad q
 * ((m/s²)²·s). Para esa Q "de aceleración continua": Q = q·[[dt³/3, dt²/2], [dt²/2, dt]].
 */
export function predict(k: Kalman1D, dt: number, q: number) {
  k.p += k.v * dt;
  // P ← F·P·Fᵀ + Q, desarrollado para F = [[1, dt], [0, 1]]
  const a = k.a + 2 * dt * k.b + dt * dt * k.c + (q * dt ** 3) / 3;
  const b = k.b + dt * k.c + (q * dt * dt) / 2;
  const c = k.c + q * dt;
  k.a = a;
  k.b = b;
  k.c = c;
  return k;
}

/** Corrección con una medida de posición z de varianza r. */
export function update(k: Kalman1D, z: number, r: number) {
  const s = k.a + r; // varianza de la innovación (H·P·Hᵀ + R)
  const k0 = k.a / s, k1 = k.b / s; // ganancia K = P·Hᵀ / s
  const y = z - k.p; // innovación
  k.p += k0 * y;
  k.v += k1 * y;
  // P ← (I − K·H)·P
  const a = (1 - k0) * k.a;
  const b = (1 - k0) * k.b;
  const c = k.c - k1 * k.b;
  k.a = a;
  k.b = b;
  k.c = c;
  return k;
}

/** Número gaussiano N(0, 1) a partir de dos uniformes (transformada de Box–Muller). */
export function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
