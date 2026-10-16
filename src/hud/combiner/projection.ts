// Geometría del HUD del combinador: actitud del avión y proyección de direcciones al plano del HUD.
//
// Marcos de referencia (todos de three.js, en metros):
//   · "Mundo del avión": el mundo ya girado por el rumbo (Sky/GroundLights giran +ψ), así que
//     delante-horizontal = +Z, arriba = +Y y la derecha del piloto = −X. Sólo faltan cabeceo y alabeo.
//   · "Cuerpo": los ejes del propio avión (nariz +Z, techo +Y, ala derecha −X). La cabina, la
//     cámara y el plano del HUD viven aquí, porque son hijos del grupo del avión.
//
// Funciones puras con tests en projection.test.ts.

import * as THREE from 'three';
import { DEG } from '../../flight/route';

const _euler = new THREE.Euler();

/**
 * Cuaternión de actitud: el mismo giro que Aircraft.tsx aplica al grupo del avión
 * (Euler 'XYZ' con x = −θ y z = +φ; ver el comentario allí). Lleva vectores del CUERPO al MUNDO;
 * su conjugado (inverso, por ser unitario) hace el viaje contrario.
 */
export function attitudeQuaternion(pitchDeg: number, rollDeg: number, out = new THREE.Quaternion()) {
  return out.setFromEuler(_euler.set(-pitchDeg * DEG, 0, rollDeg * DEG, 'XYZ'));
}

/**
 * Dirección unitaria en el mundo del avión para una marcación relativa (az, + = derecha) y una
 * elevación (el, + = arriba), en grados. Son coordenadas esféricas: la componente horizontal
 * mide cos(el); se reparte entre delante (cos az) y derecha (sen az, que va en −X).
 */
export function worldDir(azDeg: number, elDeg: number, out = new THREE.Vector3()) {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** Mundo → cuerpo: aplicar el giro inverso (el conjugado del cuaternión de actitud). */
const _qi = new THREE.Quaternion();
export function toBody(dir: THREE.Vector3, attitude: THREE.Quaternion, out = new THREE.Vector3()) {
  return out.copy(dir).applyQuaternion(_qi.copy(attitude).invert());
}

/**
 * PROYECCIÓN GNOMÓNICA sobre el plano perpendicular a la nariz (+Z del cuerpo) a distancia 1.
 *
 * La recta que sale del ojo con dirección d corta el plano z = 1 en d/d_z, así que el punto es
 * (d_x/d_z, d_y/d_z). Devolvemos x positiva hacia la DERECHA del piloto (−X), y positiva arriba.
 * Es lo mismo que hace una cámara estenopeica: un ángulo θ fuera del eje cae a tan θ del centro.
 *
 * Propiedad clave: los CÍRCULOS MÁXIMOS de la esfera (como el horizonte) se proyectan como RECTAS,
 * porque un círculo máximo es la intersección de la esfera con un plano que pasa por el ojo, y ese
 * plano corta al plano del HUD en una recta. Por eso el horizonte del HUD es una línea recta
 * exacta aunque el avión esté alabeado y cabeceado a la vez.
 *
 * `front` es false si la dirección apunta hacia atrás (d_z ≤ 0): no tiene proyección útil.
 */
export function gnomonic(d: THREE.Vector3) {
  const z = Math.max(d.z, 1e-6);
  return { x: -d.x / z, y: d.y / z, front: d.z > 1e-6 };
}

/** Atajo: dirección del mundo del avión (az, el) → punto del plano del HUD. */
const _w = new THREE.Vector3(), _b = new THREE.Vector3();
export function projectWorld(azDeg: number, elDeg: number, attitude: THREE.Quaternion) {
  return gnomonic(toBody(worldDir(azDeg, elDeg, _w), attitude, _b));
}

/** Rectángulo en coordenadas del plano del HUD (unidades de tangente, distancia 1). */
export interface HudRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Rectángulo que contiene unos puntos del cuerpo vistos desde el ojo (p. ej. los vértices del
 * combinador): proyecta cada vector ojo → punto y toma mínimos y máximos, más un margen relativo.
 */
export function boundsFromPoints(points: readonly THREE.Vector3[], eye: THREE.Vector3, margin = 0.05): HudRect {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const d = new THREE.Vector3();
  for (const p of points) {
    const g = gnomonic(d.subVectors(p, eye));
    x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x);
    y0 = Math.min(y0, g.y); y1 = Math.max(y1, g.y);
  }
  const mx = (x1 - x0) * margin, my = (y1 - y0) * margin;
  return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
}
