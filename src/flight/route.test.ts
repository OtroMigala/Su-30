import { describe, expect, it } from 'vitest';
import {
  ALT, AOA, BANK_MAX, L_TOTAL, LEG_H, N, R_TURN, SEG, SNAP_STEP, WP,
  altAt, angDiff, coordinatedBank, createFlightState, damp, flightPathAngle, groundElevation,
  headingAt, lerpAngle, loadFactor, norm360, posAt, progressForSection, scrollToFlight,
  sectionAt, smoothstep, stepFlight,
} from './route';

describe('utilidades angulares', () => {
  it('norm360 lleva cualquier ángulo a [0, 360)', () => {
    expect(norm360(-30)).toBe(330);
    expect(norm360(720)).toBe(0);
    expect(norm360(365)).toBe(5);
  });

  it('angDiff toma el camino corto', () => {
    expect(angDiff(10, 350)).toBe(20);
    expect(angDiff(350, 10)).toBe(-20);
    expect(angDiff(180, 0)).toBe(180);
  });

  it('lerpAngle cruza el norte sin dar la vuelta larga', () => {
    expect(norm360(lerpAngle(350, 10, 0.5))).toBeCloseTo(0);
  });

  it('smoothstep: extremos fijos, simétrico y con pendiente nula en los bordes', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    const e = 1e-4;
    expect(smoothstep(0, 1, e) / e).toBeLessThan(1e-3); // derivada ≈ 0 al empezar
  });
});

describe('damp (suavizado exponencial)', () => {
  it('es independiente del frame rate: dos pasos de dt/2 = un paso de dt', () => {
    const one = damp(0, 10, 3, 1 / 30);
    const two = damp(damp(0, 10, 3, 1 / 60), 10, 3, 1 / 60);
    expect(two).toBeCloseTo(one, 12);
  });

  it('a los 3/λ segundos ha recorrido el 95 %', () => {
    let x = 0;
    for (let i = 0; i < 60; i++) x = damp(x, 1, 3, 1 / 60); // 1 s con λ = 3
    expect(x).toBeCloseTo(1 - Math.exp(-3), 10);
    expect(x).toBeGreaterThan(0.95);
  });
});

describe('geometría de la ruta', () => {
  it('hay un waypoint por sección y un rumbo por tramo', () => {
    expect(WP).toHaveLength(N);
    expect(LEG_H).toHaveLength(N - 1);
    expect(L_TOTAL).toBe(SEG * (N - 1));
  });

  it('los waypoints están a SEG metros y en el rumbo de su tramo', () => {
    for (let i = 0; i < N - 1; i++) {
      const dx = WP[i + 1]!.x - WP[i]!.x, dz = WP[i + 1]!.z - WP[i]!.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(SEG, 6);
      // atan2(este, norte) = rumbo medido desde el norte en sentido horario
      expect(norm360((Math.atan2(dx, dz) * 180) / Math.PI)).toBeCloseTo(LEG_H[i]!, 6);
    }
  });

  it('posAt pasa por los waypoints y se queda en los extremos', () => {
    for (let i = 0; i < N; i++) {
      const p = posAt(i * SEG);
      expect(p.x).toBeCloseTo(WP[i]!.x, 6);
      expect(p.z).toBeCloseTo(WP[i]!.z, 6);
    }
    expect(posAt(-500)).toEqual(posAt(0));
    expect(posAt(L_TOTAL + 500)).toEqual(posAt(L_TOTAL));
  });

  it('altAt vale la altitud de cada waypoint', () => {
    for (let i = 0; i < N; i++) expect(altAt(i * SEG)).toBeCloseTo(ALT[i]!, 6);
  });

  it('headingAt: rumbo del tramo lejos de los giros, y giro anticipado', () => {
    for (let k = 0; k < N - 1; k++) {
      expect(headingAt(k * SEG + SEG / 2)).toBeCloseTo(LEG_H[k]!, 6); // mitad del tramo: recto
    }
    // El giro del waypoint 1 empieza R_TURN antes y está a medias antes de llegar al punto.
    expect(headingAt(SEG - R_TURN)).toBeCloseTo(LEG_H[0], 6);
    const atWp = headingAt(SEG);
    expect(atWp).toBeGreaterThan(LEG_H[0]);
    expect(atWp).toBeLessThan(LEG_H[1]);
  });

  it('headingAt es continuo: el salto cada 10 m no pasa del máximo teórico', () => {
    // La pendiente máxima de smoothstep (en t = 0.5) es 1.5 / ancho. El ancho del giro es
    // 1.25·R_TURN y el mayor cambio de rumbo es 75° ⇒ 75·1.5·10 / 5250 ≈ 0.214° cada 10 m.
    const maxStep = (75 * 1.5 * 10) / (1.25 * R_TURN);
    for (let s = 0; s < L_TOTAL; s += 10) {
      expect(Math.abs(angDiff(headingAt(s + 10), headingAt(s)))).toBeLessThan(maxStep + 1e-9);
    }
  });
});

describe('física', () => {
  it('giro coordinado: tan φ = v·ω/g', () => {
    expect(coordinatedBank(0)).toBe(0);
    // ω = g/v ⇒ tan φ = 1 ⇒ φ = 45°
    expect(coordinatedBank(9.81 / 230)).toBeCloseTo(45, 10);
    // Simétrico: girar a la izquierda inclina hacia el otro lado
    expect(coordinatedBank(-0.1)).toBeCloseTo(-coordinatedBank(0.1), 12);
  });

  it('factor de carga: n = 1/cos φ', () => {
    expect(loadFactor(0)).toBe(1);
    expect(loadFactor(60)).toBeCloseTo(2, 10);
    expect(loadFactor(-60)).toBeCloseTo(2, 10);
    expect(Number.isFinite(loadFactor(90))).toBe(true); // se limita a 80° para no dividir por 0
  });

  it('ángulo de trayectoria: 0 en los waypoints, positivo al subir', () => {
    // En el waypoint la pendiente es nula, pero la diferencia centrada (±60 m) mezcla la
    // curvatura de dos tramos distintos: queda un residuo de orden (d/SEG)², ~0.05°.
    expect(Math.abs(flightPathAngle(SEG))).toBeLessThan(0.1);
    expect(flightPathAngle(SEG / 2)).toBeGreaterThan(0); // 900 → 2200 m: sube
    // Comparación con la derivada analítica en la mitad del tramo:
    // h(s) = h0 + Δh·smoothstep ⇒ dh/ds = Δh·6t(1−t)/SEG, que en t = 0.5 vale 1.5·Δh/SEG.
    const slope = (1.5 * (ALT[1]! - ALT[0]!)) / SEG;
    // La diferencia centrada no es exacta: su error es O(d²) (aquí ~2·10⁻⁴°), por eso 3 decimales.
    expect(flightPathAngle(SEG / 2)).toBeCloseTo((Math.atan(slope) * 180) / Math.PI, 3);
  });

  it('elevación de las luces del suelo: −atan(h/d)', () => {
    expect(groundElevation(1000, 1000)).toBeCloseTo(-45, 10);
    expect(groundElevation(1000, 1e12)).toBeCloseTo(0, 4); // muy lejos: en el horizonte
    expect(groundElevation(1000, 1e-6)).toBeCloseTo(-90, 4); // justo debajo
  });
});

describe('scroll → vuelo', () => {
  it('el primer tramo del scroll es la entrada a la cabina', () => {
    expect(scrollToFlight(0)).toEqual({ enter: 0, s: 0 });
    expect(scrollToFlight(SNAP_STEP / 2).enter).toBeCloseTo(0.5);
    expect(scrollToFlight(SNAP_STEP)).toEqual({ enter: 1, s: 0 });
    expect(scrollToFlight(1)).toEqual({ enter: 1, s: L_TOTAL });
  });

  it('cada sección tiene su punto de snap, y sectionAt lo invierte', () => {
    for (let i = 0; i < N; i++) {
      const P = progressForSection(i);
      expect(scrollToFlight(P).s).toBeCloseTo(i * SEG, 6);
      expect(sectionAt(P)).toBe(i);
      // Las fracciones de snap coinciden con los múltiplos de SNAP_STEP
      expect(P / SNAP_STEP).toBeCloseTo(Math.round(P / SNAP_STEP), 9);
    }
    expect(sectionAt(0)).toBe(0); // el exterior cuenta como la primera sección
  });
});

describe('stepFlight', () => {
  it('quieto en un tramo recto: alas niveladas y nariz AOA sobre la trayectoria', () => {
    const f = createFlightState(SEG / 2);
    for (let i = 0; i < 120; i++) stepFlight(f, SEG / 2, 1 / 60, 0);
    expect(f.bank).toBeCloseTo(0, 6);
    expect(f.roll).toBeCloseTo(0, 6);
    expect(f.pitch).toBeCloseTo(f.gamma + AOA, 10);
  });

  it('avanzar por un giro a la derecha inclina a la derecha (y nunca pasa de BANK_MAX)', () => {
    const f = createFlightState(SEG - R_TURN);
    let maxBank = 0;
    // 30 m por fotograma a 60 fps = 1800 m/s de "scroll"
    for (let s = SEG - R_TURN; s < SEG + R_TURN / 4; s += 30) {
      stepFlight(f, s, 1 / 60, 0);
      maxBank = Math.max(maxBank, f.bank);
    }
    expect(maxBank).toBeGreaterThan(20); // 30° → 105°: giro a la derecha
    expect(maxBank).toBeLessThanOrEqual(BANK_MAX);
    // Al parar, ω = 0 y las alas vuelven a nivel
    for (let i = 0; i < 300; i++) stepFlight(f, f.s, 1 / 60, 0);
    expect(Math.abs(f.bank)).toBeLessThan(0.1);
  });

  it('sin movimiento (reduced motion) no hay deriva ni turbulencia', () => {
    const f = createFlightState(0);
    stepFlight(f, 0, 1, 0);
    expect(f.x).toBe(WP[0]!.x);
    expect(f.z).toBe(WP[0]!.z);
    expect(f.roll).toBe(f.bank);
  });

  it('la deriva avanza en la dirección del rumbo', () => {
    const f = createFlightState(0);
    stepFlight(f, 0, 1, 1);
    const h = (LEG_H[0] * Math.PI) / 180;
    expect(f.x).toBeCloseTo(Math.sin(h) * 170, 6);
    expect(f.z).toBeCloseTo(Math.cos(h) * 170, 6);
  });
});
