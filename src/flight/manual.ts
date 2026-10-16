// Vuelo manual (esquema "Expert" de Ace Combat) y guiado de vuelta a la ruta.
//
// Modelo de "masa puntual con actitud": el avión es un punto con velocidad v a lo largo de su
// nariz (ángulo de ataque y derrape nulos) y una orientación (cuaternión). El piloto manda:
//   · la TASA DE ALABEO (A/D): gira el avión alrededor de su nariz;
//   · el FACTOR DE CARGA n (W/S): cuántos "g" de sustentación genera, perpendiculares a las alas;
//   · el EMPUJE (Space acelera, Shift frena).
// La trayectoria se curva por la suma de sustentación y gravedad. Así salen solos el giro
// coordinado, los loops y los toneles, sin programar ninguna maniobra.
//
// Marco de referencia del mapa (three.js): x = −este, y = arriba, z = norte (el mismo que usan el
// cielo y el suelo). Cuerpo del avión: nariz +Z, techo +Y, ala derecha −X.
//
// Funciones puras con tests en manual.test.ts.

import * as THREE from 'three';
import { ALT, DEG, G, L_TOTAL, N, SEG, WP, altAt, angDiff, clamp, damp, headingAt, norm360, posAt } from './route';

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

export const ROLL_RATE_MAX = 150 * DEG; // rad/s
// Tasa de giro con n g a velocidad v (alas en el plano de giro): ω = g·(n − 1)/v. A 9 g y 220 m/s,
// ≈ 20°/s. Cuanto más despacio, más rápido gira con los mismos g: por eso los cazas tienen una
// "velocidad de esquina" óptima para maniobrar.
export const N_MAX = 9; // g tirando (S)
export const N_MIN = -3; // g empujando (W)
/** Aceleración del motor a empuje máximo (m/s²): un caza con relación empuje/peso ≈ 1 tiene ~10;
 *  aquí algo más para que acelerar se note en un portafolio. */
const THRUST_ACC = 22;
/** Empuje de crucero (fracción) cuando no se pulsa Space ni Shift. */
export const THROTTLE_CRUISE = 0.6;
/** Arrastre parásito: D/m = k·v². Con crucero (0.6·22 = 13.2 m/s²) el equilibrio está en
 *  v = √(13.2/k) = 220 m/s; a empuje máximo, ≈ 285 m/s. */
const DRAG_K = 13.2 / 220 ** 2;
/** Arrastre inducido extra al tirar de la palanca: maniobrar "quema" energía, como en Ace Combat. */
const DRAG_INDUCED = 0.6;
const AIRBRAKE = 3; // multiplica el arrastre parásito con Shift
export const V_MIN = 100;
export const V_MAX = 450;
export const ALT_MIN = 120;
export const ALT_MAX = 15000;

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export interface ManualState {
  /** Orientación cuerpo → mapa. */
  q: THREE.Quaternion;
  /** Posición en el mapa (m): este, norte, altitud. */
  east: number;
  north: number;
  alt: number;
  /** Velocidad (m/s) y empuje actual (0..1, con inercia de motor). */
  v: number;
  throttle: number;
  /** Factor de carga aplicado (g) y tasa de alabeo (rad/s), suavizados (la palanca no es instantánea). */
  n: number;
  rollRate: number;
  /** Auto-GCAS activo en este instante. */
  gcas: boolean;
}

export interface ManualInput {
  /** −1 (A, izquierda) .. 1 (D, derecha) */
  roll: number;
  /** −1 (W, empujar: nariz abajo) .. 1 (S, tirar: nariz arriba) */
  pitch: number;
  /** 1 = Space, −1 = Shift, 0 = crucero */
  throttle: number;
}

/** Actitud en grados a partir del cuaternión: rumbo ψ, cabeceo θ y alabeo φ. */
const _e = new THREE.Euler();
export function attitudeOf(q: THREE.Quaternion) {
  // Orden 'YXZ' = R = Ry(−ψ)·Rx(−θ)·Rz(φ): primero el rumbo, después el cabeceo y por último el
  // alabeo sobre la nariz, que es la descomposición aeronáutica (ver Aircraft.tsx y Sky.tsx).
  _e.setFromQuaternion(q, 'YXZ');
  return { heading: norm360(-_e.y / DEG), pitch: -_e.x / DEG, roll: _e.z / DEG };
}

/** Cuaternión cuerpo → mapa para un rumbo, cabeceo y alabeo (grados). */
export function quaternionOf(headingDeg: number, pitchDeg: number, rollDeg: number, out = new THREE.Quaternion()) {
  return out.setFromEuler(_e.set(-pitchDeg * DEG, -headingDeg * DEG, rollDeg * DEG, 'YXZ'));
}

export function createManualState(heading: number, pitch: number, roll: number, east: number, north: number, alt: number, v: number): ManualState {
  return { q: quaternionOf(heading, pitch, roll), east, north, alt, v, throttle: THROTTLE_CRUISE, n: 1, rollRate: 0, gcas: false };
}

// Vectores de trabajo (sin crear basura en cada paso)
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3();
const _w = new THREE.Vector3(), _dq = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

/**
 * Factor de carga "neutro": cos γ. Con las alas niveladas mantiene la trayectoria (la componente
 * vertical de la sustentación iguala a la de la gravedad perpendicular a la velocidad, g·cos γ).
 * Si alabeas sin tirar, sólo n·cos φ < cos γ sostiene: el avión gira suave y baja un poco, como uno
 * real con la palanca suelta. Para un giro nivelado hay que tirar hasta n = cos γ / cos φ.
 */
export function trimLoad(gammaRad: number) {
  return Math.cos(gammaRad);
}

/**
 * Un paso de integración (Euler explícito con dt pequeño).
 *
 * 1. Alabeo: q ← q · Rz(p·dt). Multiplicar a la DERECHA gira en ejes del cuerpo (sobre la nariz).
 * 2. Aceleración: a = g·n·û (sustentación, por el "techo" û) + (0, −g, 0) (gravedad).
 * 3. Su parte perpendicular a la nariz f̂ curva la trayectoria: la dirección de la velocidad gira
 *    con velocidad angular Ω = (f̂ × a⊥) / v (la aceleración centrípeta es a⊥ = Ω × v).
 *    q ← R(Ω·dt) · q: multiplicar a la IZQUIERDA gira en ejes del mapa; nariz y techo giran juntos.
 * 4. Velocidad: v̇ = empuje − arrastre − g·sen γ (la gravedad frena al subir y acelera al bajar).
 * 5. Posición: integra v·f̂.
 */
export function stepManual(s: ManualState, input: ManualInput, dt: number) {
  dt = Math.min(Math.max(dt, 1e-4), 0.05);

  _f.copy(Z).applyQuaternion(s.q);
  const gamma = Math.asin(clamp(_f.y, -1, 1));

  // Auto-GCAS (Automatic Ground Collision Avoidance System, del F-16): si con la trayectoria
  // actual tocarías el suelo en menos de ~4 s, el sistema toma el mando, nivela las alas y tira.
  const sink = -s.v * Math.sin(gamma); // m/s hacia abajo
  s.gcas = s.alt - ALT_MIN < Math.max(0, sink) * 4 + 60 && sink > 0;
  let rollCmd = clamp(input.roll, -1, 1) * ROLL_RATE_MAX;
  let nCmd: number;
  const trim = trimLoad(gamma);
  if (s.gcas) {
    const { roll } = attitudeOf(s.q);
    rollCmd = clamp(-roll * DEG * 3, -ROLL_RATE_MAX, ROLL_RATE_MAX); // a nivelar
    nCmd = Math.abs(roll) < 60 ? 6 : 0.5; // tirar sólo con las alas casi niveladas
  } else {
    const p = clamp(input.pitch, -1, 1);
    nCmd = p >= 0 ? trim + p * (N_MAX - trim) : trim + p * (trim - N_MIN);
  }
  // La palanca y los alerones no responden al instante: filtro de primer orden.
  s.rollRate = damp(s.rollRate, rollCmd, 10, dt);
  s.n = damp(s.n, nCmd, 6, dt);

  // 1) Alabeo en ejes del cuerpo
  s.q.multiply(_dq.setFromAxisAngle(Z, s.rollRate * dt));

  // 2) y 3) Curvatura de la trayectoria
  _f.copy(Z).applyQuaternion(s.q);
  _u.copy(Y).applyQuaternion(s.q);
  _a.copy(_u).multiplyScalar(G * s.n);
  _a.y -= G;
  _a.addScaledVector(_f, -_a.dot(_f)); // a⊥ = a − (a·f̂)f̂
  _w.crossVectors(_f, _a).divideScalar(Math.max(s.v, V_MIN));
  const wLen = _w.length();
  if (wLen > 1e-9) s.q.premultiply(_dq.setFromAxisAngle(_w.divideScalar(wLen), wLen * dt));
  s.q.normalize();

  // 4) Energía
  const target = input.throttle > 0 ? 1 : input.throttle < 0 ? 0 : THROTTLE_CRUISE;
  s.throttle = damp(s.throttle, target, 1.5, dt); // el motor tarda en subir de vueltas
  _f.copy(Z).applyQuaternion(s.q);
  const drag = DRAG_K * s.v * s.v * (input.throttle < 0 ? AIRBRAKE : 1) + DRAG_INDUCED * Math.max(0, s.n - 1) ** 2 * 0.25;
  s.v = clamp(s.v + (THRUST_ACC * s.throttle - drag - G * _f.y) * dt, V_MIN, V_MAX);

  // 5) Posición (x del mapa = −este)
  s.east -= _f.x * s.v * dt;
  s.north += _f.z * s.v * dt;
  s.alt = clamp(s.alt + _f.y * s.v * dt, ALT_MIN, ALT_MAX);
  return s;
}

// ---------------------------------------------------------------------------
// Relación con la ruta
// ---------------------------------------------------------------------------

/**
 * Punto de la ruta más cercano a (east, north): para cada tramo AB, la proyección de P es
 * A + t·(B − A) con t = ((P − A)·(B − A)) / |B − A|², limitada a [0, 1]. Se queda el tramo con la
 * menor distancia. Devuelve la distancia recorrida s de ese punto y la distancia horizontal.
 */
export function projectOnRoute(east: number, north: number) {
  let best = { s: 0, dist: Infinity };
  for (let k = 0; k < N - 1; k++) {
    const a = WP[k]!, b = WP[k + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((east - a.x) * dx + (north - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(a.x + dx * t - east, a.z + dz * t - north);
    if (d < best.dist) best = { s: (k + t) * SEG, dist: d };
  }
  return best;
}

/** Waypoint más cercano dentro de `radius` metros (−1 si ninguno). */
export function waypointNear(east: number, north: number, radius = 2500) {
  let best = -1, bd = radius;
  WP.forEach((p, i) => {
    const d = Math.hypot(p.x - east, p.z - north);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Distancia a partir de la cual se avisa de que se sale del área de operaciones (m). */
export const AREA_RADIUS = 12000;
/** Punto de la ruta que persigue el guiado, por delante de la proyección (m). */
const LOOKAHEAD = 3000;

/**
 * GUIADO DE VUELTA A LA RUTA ("persecución pura"): genera las entradas de palanca que un piloto
 * automático daría para volver a la ruta.
 *  · Se apunta a un punto de la ruta LOOKAHEAD metros por delante de la proyección del avión.
 *    Perseguir un punto que avanza produce una aproximación suave y tangente a la ruta.
 *  · Alabeo deseado proporcional al error de rumbo (máx. 60°); la palanca de alabeo, proporcional
 *    a la diferencia entre alabeo deseado y actual (un lazo de control P en cascada).
 *  · Factor de carga: el del giro nivelado, cos γ / cos φ, más una corrección proporcional al
 *    error de ángulo de trayectoria, que a su vez sale del error de altitud.
 *  · Empuje para mantener ~300 m/s.
 */
export function returnGuidance(s: ManualState): ManualInput & { done: boolean; sProj: number } {
  const proj = projectOnRoute(s.east, s.north);
  const sT = Math.min(proj.s + LOOKAHEAD, L_TOTAL);
  const T = posAt(sT);
  const att = attitudeOf(s.q);
  const bearing = Math.atan2(T.x - s.east, T.z - s.north) / DEG;
  const eHead = angDiff(bearing, att.heading);
  const bankCmd = clamp(eHead * 2, -60, 60);
  const roll = clamp((bankCmd - att.roll) / 40, -1, 1);

  const gammaCmd = clamp((altAt(sT) - s.alt) / 60, -12, 12); // ~1° por cada 60 m de error
  const gamma = att.pitch;
  const phi = att.roll * DEG;
  const nNeeded = Math.cos(gamma * DEG) / Math.max(Math.cos(phi), 0.35) + (gammaCmd - gamma) * 0.08;
  // Convertir n deseado a la "palanca" del modelo (inverso de la ley de stepManual)
  const trim = trimLoad(gamma * DEG);
  const pitch = nNeeded >= trim ? clamp((nNeeded - trim) / (N_MAX - trim), 0, 1) : clamp((nNeeded - trim) / (trim - N_MIN), -1, 0);

  const throttle = s.v < 280 ? 1 : s.v > 320 ? -1 : 0;
  // Alineado con la ruta: cerca, con el rumbo del tramo y a su altitud.
  const done =
    proj.dist < 200 &&
    Math.abs(angDiff(headingAt(proj.s), att.heading)) < 8 &&
    Math.abs(altAt(proj.s) - s.alt) < 150 &&
    Math.abs(att.roll) < 15;
  return { roll, pitch, throttle, done, sProj: proj.s };
}

/** Altitud del waypoint i (atajo para el HUD). */
export const altOfWaypoint = (i: number) => ALT[clamp(i, 0, N - 1)]!;
