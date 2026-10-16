// Radar: ecuación del radar, relación señal/ruido y Doppler.
//
// Valores ILUSTRATIVOS de un radar de caza en banda X, plausibles pero no los de un Su-30 real.
// Funciones puras con tests en avionics.test.ts.

/** Constante de Boltzmann (J/K) y velocidad de la luz (m/s). */
export const K_B = 1.380649e-23;
export const C = 299_792_458;

export const RADAR = {
  /** Potencia transmitida (W). */
  pt: 5000,
  /** Ganancia de la antena (dB): la misma al transmitir y al recibir. */
  gainDb: 35,
  /** Frecuencia (Hz): banda X, 10 GHz ⇒ λ = 3 cm. */
  freq: 10e9,
  /** Ancho de banda del receptor (Hz) y figura de ruido (dB). */
  bandwidth: 1e6,
  noiseFigureDb: 3,
  /** Temperatura de referencia del ruido (K). */
  t0: 290,
  /** Umbral de detección (dB): con ~13 dB, alta probabilidad de detectar y pocas falsas alarmas. */
  thresholdDb: 13,
};

export const db = (x: number) => 10 * Math.log10(x);
export const fromDb = (d: number) => 10 ** (d / 10);

/**
 * Potencia de ruido térmico del receptor: N = k·T₀·B·F. Es el "piso" sobre el que hay que oír el eco.
 */
export function noisePower(r = RADAR) {
  return K_B * r.t0 * r.bandwidth * fromDb(r.noiseFigureDb);
}

/**
 * ECUACIÓN DEL RADAR (monoestático, la misma antena transmite y recibe):
 *
 *     Pr = Pt·G²·λ²·σ / ((4π)³·R⁴)
 *
 * De dónde sale cada término:
 *  · Pt·G / (4πR²): densidad de potencia que llega al blanco (la esfera de radio R reparte la
 *    potencia; la antena la concentra G veces).
 *  · × σ: el blanco "recoge" esa potencia en su sección radar σ (m²) y la reirradia.
 *  · / (4πR²) otra vez: el eco vuelve repartiéndose en otra esfera.
 *  · × G·λ²/(4π): área efectiva de la antena receptora.
 * Por eso R⁴: duplicar la distancia divide el eco entre 16 (−12 dB).
 *
 * @param range distancia (m) @param rcs sección radar σ (m²)
 */
export function receivedPower(range: number, rcs: number, r = RADAR) {
  const lambda = C / r.freq;
  const g = fromDb(r.gainDb);
  return (r.pt * g * g * lambda * lambda * rcs) / ((4 * Math.PI) ** 3 * range ** 4);
}

/** Relación señal/ruido (dB) de un blanco. */
export function snrDb(range: number, rcs: number, r = RADAR) {
  return db(receivedPower(range, rcs, r) / noisePower(r));
}

/** Alcance máximo (m) para un blanco de sección σ: se despeja R de SNR = umbral. */
export function maxRange(rcs: number, r = RADAR) {
  const lambda = C / r.freq;
  const g = fromDb(r.gainDb);
  const prMin = noisePower(r) * fromDb(r.thresholdDb);
  return ((r.pt * g * g * lambda * lambda * rcs) / ((4 * Math.PI) ** 3 * prMin)) ** 0.25;
}

/**
 * Desplazamiento DOPPLER del eco: f_d = 2·v_r / λ. El factor 2 aparece porque la distancia cambia
 * en el camino de ida Y en el de vuelta. v_r > 0 = acercándose.
 */
export function dopplerHz(closingSpeed: number, r = RADAR) {
  return (2 * closingSpeed * r.freq) / C;
}
