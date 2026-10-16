import { describe, expect, it } from 'vitest';
import {
  ALT_MIN, N_MAX, attitudeOf, createManualState, projectOnRoute, quaternionOf, returnGuidance, stepManual, waypointNear,
} from './manual';
import { G, SEG, WP, angDiff, coordinatedBank, posAt } from './route';

const DEG = Math.PI / 180;
const run = (s: ReturnType<typeof createManualState>, secs: number, input = { roll: 0, pitch: 0, throttle: 0 }) => {
  for (let t = 0; t < secs; t += 1 / 120) stepManual(s, input, 1 / 120);
  return s;
};

describe('actitud', () => {
  it('rumbo, cabeceo y alabeo sobreviven a la ida y vuelta por el cuaternión', () => {
    const a = attitudeOf(quaternionOf(123, 17, -40));
    expect(a.heading).toBeCloseTo(123, 8);
    expect(a.pitch).toBeCloseTo(17, 8);
    expect(a.roll).toBeCloseTo(-40, 8);
  });
});

describe('vuelo manual', () => {
  it('palanca neutra con alas niveladas: vuelo recto y nivelado', () => {
    const s = createManualState(45, 0, 0, 0, 0, 3000, 250);
    s.throttle = 0.6;
    run(s, 10);
    const a = attitudeOf(s.q);
    expect(a.heading).toBeCloseTo(45, 3);
    expect(s.alt).toBeCloseTo(3000, 0);
  });

  it('giro coordinado: con alabeo φ y n = 1/cos φ gira a ω = g·tan φ / v sin perder altura', () => {
    const phi = 45, v = 250;
    const s = createManualState(0, 0, phi, 0, 0, 3000, v);
    const n = 1 / Math.cos(phi * DEG);
    s.n = n; // palanca ya en posición (sin transitorio)
    // Mantener la velocidad fija para aislar la geometría del giro
    const pitch = (n - 1) / (N_MAX - 1);
    let h0 = attitudeOf(s.q).heading;
    let turned = 0;
    for (let t = 0; t < 5; t += 1 / 240) {
      stepManual(s, { roll: 0, pitch, throttle: 0 }, 1 / 240);
      s.v = v;
      const h = attitudeOf(s.q).heading;
      turned += angDiff(h, h0);
      h0 = h;
    }
    const omega = (G * Math.tan(phi * DEG)) / v; // rad/s
    expect(turned * DEG).toBeCloseTo(omega * 5, 2);
    expect(Math.abs(s.alt - 3000)).toBeLessThan(5);
    // Y es la misma física que el autopiloto: coordinatedBank(ω) devuelve el alabeo de partida.
    expect(coordinatedBank(omega, v)).toBeCloseTo(phi, 6);
  });

  it('energía: al subir se pierde velocidad y al bajar se gana', () => {
    // Desde la velocidad de equilibrio del crucero (220 m/s), donde empuje = arrastre
    const up = createManualState(0, 25, 0, 0, 0, 3000, 220);
    const down = createManualState(0, -25, 0, 0, 0, 6000, 220);
    run(up, 4);
    run(down, 4);
    expect(up.v).toBeLessThan(215);
    expect(down.v).toBeGreaterThan(225);
  });

  it('tirar a fondo: la nariz sube a ω ≈ g·(n − 1)/v', () => {
    const s = createManualState(0, 0, 0, 0, 0, 5000, 220);
    s.n = N_MAX; // palanca ya a fondo
    let prev = 0;
    for (let t = 0; t < 0.5; t += 1 / 240) {
      stepManual(s, { roll: 0, pitch: 1, throttle: 0 }, 1 / 240);
      s.v = 220;
      prev = attitudeOf(s.q).pitch;
    }
    // En el primer medio segundo (γ ≈ 0, n = 9): ω = 9.81·8/220 rad/s ≈ 20.4°/s → ~10°
    expect(prev).toBeCloseTo((((G * (N_MAX - 1)) / 220) * 0.5) / DEG, 0);
  });

  it('Auto-GCAS: un picado a fondo hacia el suelo no llega a tocarlo', () => {
    const s = createManualState(0, -35, 0, 0, 0, 1500, 350);
    let minAlt = Infinity, triggered = false;
    for (let t = 0; t < 30; t += 1 / 120) {
      stepManual(s, { roll: 0, pitch: -1, throttle: 1 }, 1 / 120);
      minAlt = Math.min(minAlt, s.alt);
      triggered ||= s.gcas;
    }
    expect(triggered).toBe(true);
    expect(minAlt).toBeGreaterThan(ALT_MIN);
  });
});

describe('relación con la ruta', () => {
  it('projectOnRoute: un waypoint se proyecta sobre sí mismo', () => {
    const p = projectOnRoute(WP[1]!.x, WP[1]!.z);
    expect(p.s).toBeCloseTo(SEG, 3);
    expect(p.dist).toBeCloseTo(0, 6);
  });

  it('projectOnRoute: un punto a 1 km a un lado del medio del primer tramo', () => {
    const m = posAt(SEG / 2), h = (30 * Math.PI) / 180;
    // Perpendicular al rumbo 30°: (cos h, −sen h) en (este, norte)
    const p = projectOnRoute(m.x + Math.cos(h) * 1000, m.z - Math.sin(h) * 1000);
    expect(p.s).toBeCloseTo(SEG / 2, 3);
    expect(p.dist).toBeCloseTo(1000, 3);
  });

  it('waypointNear captura sólo dentro del radio', () => {
    expect(waypointNear(WP[2]!.x + 500, WP[2]!.z)).toBe(2);
    expect(waypointNear(WP[2]!.x + 5000, WP[2]!.z)).toBe(-1);
  });

  it('el guiado devuelve el avión a la ruta desde 6 km, con rumbo contrario', () => {
    const m = posAt(SEG * 1.5), h = (105 * Math.PI) / 180;
    const s = createManualState(285, 0, 0, m.x + Math.cos(h) * 6000, m.z - Math.sin(h) * 6000, 1200, 250);
    let done = false, t = 0;
    for (; t < 240 && !done; t += 1 / 60) {
      const g = returnGuidance(s);
      done = g.done;
      stepManual(s, g, 1 / 60);
    }
    expect(done).toBe(true);
    expect(t).toBeLessThan(120); // menos de dos minutos
  });
});
