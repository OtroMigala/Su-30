import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attitudeQuaternion, boundsFromPoints, gnomonic, projectWorld, worldDir } from './projection';

const DEG = Math.PI / 180;

describe('actitud', () => {
  it('cabecear hacia arriba levanta la nariz', () => {
    const q = attitudeQuaternion(10, 0);
    const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(nose.y).toBeCloseTo(Math.sin(10 * DEG), 10);
  });

  it('alabear a la derecha baja el ala derecha (−X)', () => {
    const q = attitudeQuaternion(0, 30);
    const rightWing = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
    expect(rightWing.y).toBeCloseTo(-Math.sin(30 * DEG), 10);
  });
});

describe('proyección gnomónica', () => {
  it('el eje de la nariz cae en el centro y un ángulo θ a tan θ', () => {
    const c = gnomonic(new THREE.Vector3(0, 0, 1));
    expect(c.x).toBe(-0);
    expect(c.y).toBe(0);
    const up = gnomonic(worldDir(0, 12));
    expect(up.y).toBeCloseTo(Math.tan(12 * DEG), 10);
    const right = gnomonic(worldDir(20, 0));
    expect(right.x).toBeCloseTo(Math.tan(20 * DEG), 10); // derecha = x positiva
  });

  it('con cabeceo θ, el horizonte queda tan θ por debajo del centro', () => {
    const q = attitudeQuaternion(8, 0);
    expect(projectWorld(0, 0, q).y).toBeCloseTo(-Math.tan(8 * DEG), 10);
  });

  it('el horizonte (círculo máximo) se proyecta como una RECTA aunque haya alabeo y cabeceo', () => {
    const q = attitudeQuaternion(7, 35);
    const pts = [-25, -10, 0, 12, 25].map((az) => projectWorld(az, 0, q));
    const [a, b] = [pts[0]!, pts[4]!];
    for (const p of pts) {
      // Producto vectorial 2D (b − a) × (p − a) = 0 ⇔ p está en la recta ab
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      expect(Math.abs(cross)).toBeLessThan(1e-12);
    }
  });

  it('con alabeo a la derecha, el horizonte sube por la derecha', () => {
    const q = attitudeQuaternion(0, 30);
    const left = projectWorld(-10, 0, q), right = projectWorld(10, 0, q);
    expect(right.y).toBeGreaterThan(left.y);
    // y su pendiente es exactamente tan φ (el horizonte gira φ alrededor del centro)
    expect((right.y - left.y) / (right.x - left.x)).toBeCloseTo(Math.tan(30 * DEG), 10);
  });

  it('una dirección hacia atrás se marca como no proyectable', () => {
    expect(gnomonic(new THREE.Vector3(0, 0, -1)).front).toBe(false);
  });
});

describe('límites', () => {
  it('boundsFromPoints envuelve los puntos vistos desde el ojo', () => {
    const eye = new THREE.Vector3(0, 1, 0);
    const pts = [new THREE.Vector3(0.1, 1.1, 1), new THREE.Vector3(-0.2, 0.8, 1)];
    const r = boundsFromPoints(pts, eye, 0);
    expect(r.x0).toBeCloseTo(-0.1); // (0.1, ·) está a la IZQUIERDA del piloto (+X)
    expect(r.x1).toBeCloseTo(0.2);
    expect(r.y0).toBeCloseTo(-0.2);
    expect(r.y1).toBeCloseTo(0.1);
  });
});
