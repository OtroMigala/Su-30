// Ruta de vuelo y física del avión, portadas de reference/cockpit-hud.html.
//
// Todo aquí son funciones PURAS (sin DOM, sin three.js, sin React): reciben números y devuelven
// números. Eso permite probarlas con tests en Node (route.test.ts) y razonar sobre ellas como
// sobre fórmulas. La escena sólo lee sus resultados.
//
// Convenciones (las de la navegación aérea, no las de three.js):
//   · Rumbo ψ en grados, 0° = norte, creciendo en sentido horario (90° = este).
//   · Plano del mapa: x = este, z = norte, en metros. La altitud h va aparte.
//   · Alabeo φ > 0 = ala derecha abajo (giro a la derecha). Cabeceo θ > 0 = nariz arriba.

import { CONTENT } from '../data/content';

// ---------------------------------------------------------------------------
// Utilidades matemáticas
// ---------------------------------------------------------------------------

export const DEG = Math.PI / 180;
/** Aceleración de la gravedad (m/s²). */
export const G = 9.81;

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Interpolación de Hermite: 0 antes de a, 1 después de b, y en medio el polinomio 3t² − 2t³.
 * Su derivada (6t − 6t²) vale 0 en ambos extremos: la transición arranca y termina con
 * pendiente nula. Por eso un giro mezclado con smoothstep no tiene "tirones" de velocidad
 * angular al empezar ni al terminar.
 */
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Lleva un ángulo a [0, 360). El doble módulo arregla que en JS (−30 % 360) = −30. */
export const norm360 = (h: number) => ((h % 360) + 360) % 360;

/**
 * Diferencia angular a − b por el camino corto, en (−180, 180].
 * Sin esto, ir de 350° a 10° daría −340° (vuelta casi completa) en vez de +20°.
 */
export const angDiff = (a: number, b: number) => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

/** Interpola ángulos por el camino corto. */
export const lerpAngle = (a: number, b: number, t: number) => a + angDiff(b, a) * t;

/**
 * Suavizado exponencial independiente del frame rate: x ← x + (objetivo − x)·k, con
 * k = 1 − e^(−λ·dt).
 *
 * Por qué así y no con un k fijo (p. ej. 0.1 por fotograma): con k fijo el sistema converge
 * el doble de rápido a 120 fps que a 60. Este es el filtro de primer orden dx/dt = λ·(objetivo − x)
 * resuelto exactamente para un paso dt: la distancia al objetivo decae como e^(−λt).
 * Dos pasos de dt/2 dan lo mismo que uno de dt, porque e^(−λ·dt/2)·e^(−λ·dt/2) = e^(−λ·dt).
 * λ es la inversa de la constante de tiempo: con λ = 3, el 95 % del camino en ~1 s (3/λ).
 */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/** Versión angular de damp (por el camino corto). */
export const dampAngle = (cur: number, target: number, lambda: number, dt: number) =>
  cur + angDiff(target, cur) * (1 - Math.exp(-lambda * dt));

// ---------------------------------------------------------------------------
// Geometría de la ruta
// ---------------------------------------------------------------------------

/** Número de waypoints (uno por sección del sitio). */
export const N = CONTENT.sections.length;
/** Distancia entre waypoints (m). */
export const SEG = 14000;
/** Rumbo de cada tramo (grados). Hay N − 1 tramos. */
export const LEG_H = [30, 105, 165, 110, 45] as const;
/** Distancia antes del waypoint a la que empieza el giro (m). */
export const R_TURN = 4200;
/** Altitud de cada waypoint (m). */
export const ALT = CONTENT.sections.map((s) => s.alt);
/** Longitud total de la ruta (m). */
export const L_TOTAL = SEG * (N - 1);

if (LEG_H.length !== N - 1) throw new Error(`route.ts: LEG_H necesita ${N - 1} rumbos, tiene ${LEG_H.length}`);

/**
 * Posiciones de los waypoints. Cada uno se obtiene del anterior avanzando SEG metros en el rumbo
 * del tramo: es pasar de coordenadas polares (distancia, rumbo) a cartesianas. Con el rumbo
 * medido desde el norte en sentido horario, este = sen ψ y norte = cos ψ (al revés que el
 * ángulo matemático habitual, que se mide desde el eje x en sentido antihorario).
 */
export const WP: readonly { x: number; z: number }[] = (() => {
  const wp = [{ x: 0, z: 0 }];
  for (let i = 0; i < N - 1; i++) {
    const p = wp[i]!, h = LEG_H[i]! * DEG;
    wp.push({ x: p.x + Math.sin(h) * SEG, z: p.z + Math.cos(h) * SEG });
  }
  return wp;
})();

/** Tramo k ∈ [0, N−2] y fracción t ∈ [0, 1] recorrida en él, para la distancia s. */
function leg(s: number) {
  const k = clamp(Math.floor(s / SEG), 0, N - 2);
  return { k, t: clamp((s - k * SEG) / SEG, 0, 1) };
}

/** Posición en el mapa a la distancia s de la ruta (interpolación lineal en el tramo). */
export function posAt(s: number) {
  const { k, t } = leg(s);
  const a = WP[k]!, b = WP[k + 1]!;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Rumbo a la distancia s. Cada giro mezcla el rumbo del tramo anterior con el del siguiente con un
 * smoothstep que empieza R_TURN metros antes del waypoint y termina R_TURN/4 después: el avión
 * "anticipa" el giro, como haría un piloto (o un piloto automático) para no pasarse del punto.
 *
 * Nota: la posición (posAt) sigue las rectas de los tramos aunque el rumbo ya esté girando; es
 * una aproximación que no se nota a esta escala (el desvío lateral sería de unos cientos de metros).
 */
export function headingAt(s: number) {
  let h: number = LEG_H[0];
  for (let k = 1; k < N - 1; k++) {
    const t = smoothstep(-R_TURN, R_TURN * 0.25, s - k * SEG);
    if (t <= 0) break;
    h = lerpAngle(h, LEG_H[k]!, t);
  }
  return norm360(h);
}

/** Altitud a la distancia s: subida o bajada suave (smoothstep) entre waypoints. */
export function altAt(s: number) {
  const { k, t } = leg(s);
  return ALT[k]! + (ALT[k + 1]! - ALT[k]!) * smoothstep(0, 1, t);
}

// ---------------------------------------------------------------------------
// Física
// ---------------------------------------------------------------------------

/** Velocidad de referencia para el giro coordinado (m/s, ~450 nudos). */
export const V_REF = 230;
/** Límite de velocidad angular de guiñada (rad/s) y de alabeo (grados), como en el prototipo. */
export const OMEGA_MAX = 0.45;
export const BANK_MAX = 65;
/** Ángulo de ataque: la nariz va por encima del vector velocidad (grados). */
export const AOA = 2.5;

/**
 * Ángulo de trayectoria γ = atan(Δh / Δs) (grados): cuánto sube o baja el vector velocidad.
 * Se calcula con una diferencia CENTRADA, [h(s+d) − h(s−d)] / 2d, cuyo error es O(d²); la
 * diferencia hacia delante [h(s+d) − h(s)] / d sólo es O(d).
 */
export function flightPathAngle(s: number, d = 60) {
  return Math.atan((altAt(s + d) - altAt(s - d)) / (2 * d)) / DEG;
}

/**
 * Alabeo de un giro coordinado (grados): tan φ = v·ω / g.
 *
 * De dónde sale: en un giro sin derrape la sustentación L está inclinada φ. Su componente
 * vertical sostiene el peso, L·cos φ = m·g, y la horizontal aporta la fuerza centrípeta,
 * L·sen φ = m·v²/r = m·v·ω (porque v = ω·r). Dividiendo: tan φ = v·ω / g. La masa se cancela:
 * a la misma velocidad y tasa de giro, un caza y una avioneta se inclinan igual.
 *
 * @param omega velocidad angular de guiñada (rad/s); positiva = giro a la derecha.
 */
export function coordinatedBank(omega: number, v = V_REF) {
  return Math.atan((v * omega) / G) / DEG;
}

/**
 * Factor de carga n = L / (m·g) = 1 / cos φ (los "G" que siente el piloto en un giro nivelado).
 * Sale de la misma ecuación vertical: L·cos φ = m·g. A 60° de alabeo, n = 2.
 */
export function loadFactor(bankDeg: number) {
  return 1 / Math.cos(clamp(bankDeg, -80, 80) * DEG);
}

/**
 * Elevación aparente (grados, negativa = bajo el horizonte) de un punto del suelo a distancia
 * horizontal d visto desde altitud h: el triángulo rectángulo de catetos h y d da −atan(h/d).
 * Las luces lejanas se acercan al horizonte (d → ∞ ⇒ 0°) y las de debajo tienden a −90°.
 * (Ignora la curvatura de la Tierra: a 4 km de altura el horizonte real baja sólo ~2°.)
 */
export function groundElevation(h: number, d: number) {
  return -Math.atan(h / d) / DEG;
}

// ---------------------------------------------------------------------------
// Scroll → vuelo
// ---------------------------------------------------------------------------

/**
 * El scroll se reparte en N tramos iguales: el primero es la entrada a la cabina (exterior →
 * cam_pilot) y los N − 1 siguientes son los tramos de la ruta. Así hay N + 1 puntos de snap
 * equiespaciados cada 1/N: P = 0 (exterior), P = 1/N (cabina en el waypoint 0) ... P = 1 (último).
 */
export const SNAP_STEP = 1 / N;

/** Traduce el progreso del scroll P ∈ [0, 1] a la entrada (0..1) y la distancia recorrida (m). */
export function scrollToFlight(P: number) {
  const p = clamp(P, 0, 1) * N; // en "tramos": [0, 1] entrada, [1, N] ruta
  return { enter: clamp(p, 0, 1), s: clamp(p - 1, 0, N - 1) * SEG };
}

/** Progreso del scroll en el que la cabina está sobre el waypoint i. */
export function progressForSection(i: number) {
  return (clamp(Math.round(i), 0, N - 1) + 1) / N;
}

/** Sección (waypoint) más cercana al progreso P. El exterior cuenta como la sección 0. */
export function sectionAt(P: number) {
  return clamp(Math.round(clamp(P, 0, 1) * N) - 1, 0, N - 1);
}

// ---------------------------------------------------------------------------
// Integrador del vuelo (estado que evoluciona fotograma a fotograma)
// ---------------------------------------------------------------------------

export interface FlightState {
  /** Distancia recorrida en la ruta (m). */
  s: number;
  heading: number;
  bank: number;
  /** Ángulo de trayectoria γ (grados). */
  gamma: number;
  /** Actitud final que se dibuja: cabeceo y alabeo con turbulencia (grados). */
  pitch: number;
  roll: number;
  alt: number;
  /** Velocidad indicada (nudos) y |ds/dt| suavizado (m/s de "scroll"). */
  kts: number;
  dsdt: number;
  /** Posición en el mapa (m) = ruta + deriva. La deriva hace que el suelo se mueva aunque
   *  no hagas scroll: el avión nunca está parado. */
  x: number;
  z: number;
  driftX: number;
  driftZ: number;
  /** Tiempo acumulado (s), para la turbulencia. */
  t: number;
}

export function createFlightState(s = 0): FlightState {
  const p = posAt(s);
  return {
    s, heading: headingAt(s), bank: 0, gamma: flightPathAngle(s), pitch: AOA, roll: 0, alt: altAt(s),
    kts: 380, dsdt: 0, x: p.x, z: p.z, driftX: 0, driftZ: 0, t: 0,
  };
}

/** Velocidad de deriva sobre el suelo cuando no hay scroll (m/s). */
export const DRIFT_SPEED = 170;

/**
 * Avanza el estado un paso dt hacia la distancia objetivo `s` (la que dicta el scroll).
 * Muta `f` en lugar de devolver uno nuevo: se llama 60 veces por segundo y así no se crea
 * basura para el recolector de memoria. Sigue siendo determinista (mismas entradas → mismo
 * resultado), que es lo que permite probarlo.
 *
 * @param motion 1 = turbulencia y deriva activas; 0 con prefers-reduced-motion.
 */
export function stepFlight(f: FlightState, s: number, dt: number, motion = 1) {
  dt = Math.max(dt, 1e-4);
  f.t += dt;
  const ds = s - f.s;
  f.s = s;
  f.dsdt = damp(f.dsdt, Math.abs(ds) / dt, 4, dt);

  // 1) Rumbo y alabeo del giro coordinado. ω = Δψ/Δt sale de cuánto cambió el rumbo en este
  //    paso: si haces scroll en una curva, el avión gira e inclina las alas; si paras, ω = 0 y
  //    las nivela. El alabeo se suaviza (λ = 3): un avión real tarda en rodar, no salta.
  const prev = f.heading;
  f.heading = headingAt(s);
  const omega = clamp((angDiff(f.heading, prev) * DEG) / dt, -OMEGA_MAX, OMEGA_MAX);
  f.bank = damp(f.bank, clamp(coordinatedBank(omega), -BANK_MAX, BANK_MAX), 3, dt);

  // 2) Altitud y cabeceo: la nariz va AOA grados por encima de la trayectoria.
  f.alt = altAt(s);
  f.gamma = flightPathAngle(s);

  // 3) Turbulencia: suma de senos con frecuencias inconmensurables (1.3, 2.9, 1.7, 3.7 rad/s)
  //    para que el patrón no se repita a la vista. Amplitud < 1°: se nota, no marea.
  const tRoll = motion * (Math.sin(f.t * 1.3) * 0.5 + Math.sin(f.t * 2.9 + 1) * 0.25);
  const tPitch = motion * (Math.sin(f.t * 1.7 + 2) * 0.3 + Math.sin(f.t * 3.7) * 0.15);
  f.pitch = f.gamma + AOA + tPitch;
  f.roll = f.bank + tRoll;

  // 4) Velocidad indicada: crucero de 380 kt más "empuje" cuando haces scroll rápido.
  f.kts = damp(f.kts, 380 + Math.min(560, f.dsdt * 0.035), 2, dt);

  // 5) Posición: la de la ruta más la deriva acumulada en la dirección del rumbo.
  const h = f.heading * DEG;
  f.driftX += Math.sin(h) * DRIFT_SPEED * dt * motion;
  f.driftZ += Math.cos(h) * DRIFT_SPEED * dt * motion;
  const p = posAt(s);
  f.x = p.x + f.driftX;
  f.z = p.z + f.driftZ;
  return f;
}
