import { describe, expect, it } from 'vitest';
import { RADAR, db, dopplerHz, maxRange, noisePower, receivedPower, snrDb } from './radar';
import { createKalman1D, gaussian, predict, update } from './kalman';
import { fsplDb, linkBudget, radioHorizonKm } from './link';
import { rng } from '../scene/random';

describe('radar', () => {
  it('ruido térmico: k·T·B·F ≈ −141 dBW con 1 MHz y F = 3 dB', () => {
    expect(db(noisePower())).toBeCloseTo(-141, 0);
  });

  it('el eco cae como 1/R⁴: el doble de distancia son −12 dB', () => {
    expect(snrDb(20000, 5) - snrDb(10000, 5)).toBeCloseTo(-12.04, 2);
    expect(receivedPower(10000, 10) / receivedPower(10000, 5)).toBeCloseTo(2, 10); // ∝ σ
  });

  it('en el alcance máximo la SNR es justo el umbral', () => {
    expect(snrDb(maxRange(5), 5)).toBeCloseTo(RADAR.thresholdDb, 8);
    // Alcance ∝ σ^(1/4): 16 veces más sección radar = el doble de alcance
    expect(maxRange(80) / maxRange(5)).toBeCloseTo(2, 8);
  });

  it('Doppler: 220 m/s en banda X ≈ 14.7 kHz', () => {
    expect(dopplerHz(220)).toBeCloseTo(14677, -1);
  });
});

describe('enlace', () => {
  it('FSPL: +6 dB al duplicar la distancia; 1 km a 1 GHz ≈ 92.4 dB', () => {
    expect(fsplDb(1000)).toBeCloseTo(92.45, 1);
    expect(fsplDb(2000) - fsplDb(1000)).toBeCloseTo(6.02, 2);
  });

  it('balance: el margen baja con la distancia', () => {
    expect(linkBudget(10000).marginDb).toBeGreaterThan(linkBudget(100000).marginDb);
  });

  it('horizonte radio: avión a 3000 m y torre a 10 m ≈ 239 km', () => {
    expect(radioHorizonKm(3000, 10)).toBeCloseTo(238.7, 0);
  });
});

describe('filtro de Kalman', () => {
  it('Box–Muller da media 0 y desviación 1', () => {
    const r = rng(7);
    const xs = Array.from({ length: 20000 }, () => gaussian(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(sd).toBeCloseTo(1, 1);
  });

  it('con GPS de σ = 15 m a 1 Hz, la estimación tiene mucho menos error que la medida', () => {
    const r = rng(11);
    const k = createKalman1D(0, 0);
    const sigma = 15, v = 220;
    let errMeas = 0, errEst = 0, n = 0;
    for (let t = 1; t <= 120; t++) {
      for (let i = 0; i < 10; i++) predict(k, 0.1, 4);
      const truth = v * t;
      const z = truth + sigma * gaussian(r);
      update(k, z, sigma * sigma);
      if (t > 20) {
        errMeas += (z - truth) ** 2;
        errEst += (k.p - truth) ** 2;
        n++;
      }
    }
    const rmsMeas = Math.sqrt(errMeas / n), rmsEst = Math.sqrt(errEst / n);
    expect(rmsMeas).toBeGreaterThan(10);
    expect(rmsEst).toBeLessThan(rmsMeas * 0.6);
    expect(k.v).toBeCloseTo(v, -1); // y estima la velocidad, que el GPS no mide directamente
  });

  it('la covarianza se mantiene simétrica definida positiva', () => {
    const k = createKalman1D(0);
    for (let i = 0; i < 50; i++) {
      predict(k, 0.1, 4);
      if (i % 10 === 0) update(k, 0, 225);
    }
    expect(k.a).toBeGreaterThan(0);
    expect(k.c).toBeGreaterThan(0);
    expect(k.a * k.c - k.b * k.b).toBeGreaterThan(0);
  });
});
