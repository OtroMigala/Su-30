import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig } from '../store/flight';
import { prefersReducedMotion } from '../flight/intro';
import type { CockpitRefs } from './cockpit';

// --- Parámetros de la órbita exterior (metros, en el espacio del avión) ---
const ORBIT_RADIUS = 24;  // con 24 m y FOV 38° se ve entero el avión (22.6 m de largo)
const ORBIT_HEIGHT = 4.5;
const ORBIT_SPEED = 0.12; // rad/s → una vuelta cada 52 s: lenta, de "toma de presentación"
const ORBIT_THETA0 = -0.6;
const LOOK_EXTERIOR = new THREE.Vector3(0, 0.8, 0.5); // centro aproximado del avión

// Punto de control de la curva de entrada: sobre el canopy, justo detrás de la cabina.
const APPROACH = new THREE.Vector3(0, 3.4, 3.6);

// Dentro de la cabina la cámara mira un poco hacia abajo (como un piloto que revisa el HUD y
// el tablero). Con la mirada horizontal el MFD queda a 34° bajo la línea de visión, fuera del
// campo vertical de ±31°. A 8° queda a 26° y se ve en la parte inferior. Se revisará en la
// fase 4 (el HUD está 6.7° por debajo de la horizontal) y en la 5 (modo focus).
const COCKPIT_PITCH = (-8 * Math.PI) / 180;

const FOV_EXTERIOR = 38;
const FOV_COCKPIT = 62; // el prototipo usa 62° de FOV vertical

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Cámara hija del avión: se mueve en el espacio LOCAL del avión, así que cuando la fase 2 lo
 * incline, el horizonte gira alrededor del piloto y la cabina se mantiene fija en pantalla.
 *
 * Posición (rig.enter = t, de 0 a 1): curva de Bézier cuadrática
 *     B(t) = (1−t)²·P0 + 2(1−t)t·P1 + t²·P2
 * P0 = punto de la órbita, P1 = APPROACH (sobre el canopy), P2 = cam_pilot.
 * La curva parte de P0 en dirección a P1 y llega a P2 con la tangente B'(1) = 2(P2 − P1),
 * es decir, bajando hacia los ojos del piloto a través del cristal (transparente), sin
 * cruzar el fuselaje opaco, que sí atravesaría una línea recta desde la órbita.
 */
export function CameraRig({ cockpit }: { cockpit: CockpitRefs }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const theta = useRef(ORBIT_THETA0);
  const frontHidden = useRef(false);
  const tmp = useMemo(
    () => ({
      p0: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      // Punto a 50 m en la dirección de la mirada final: adelante (+Z) inclinada COCKPIT_PITCH.
      lookForward: cockpit.pilotPos
        .clone()
        .add(new THREE.Vector3(0, Math.sin(COCKPIT_PITCH), Math.cos(COCKPIT_PITCH)).multiplyScalar(50)),
      m: new THREE.Matrix4(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [cockpit],
  );
  const reduced = useMemo(prefersReducedMotion, []);
  const debugTheta = useMemo(() => {
    if (!import.meta.env.DEV) return null;
    const v = new URLSearchParams(location.search).get('theta');
    return v === null ? null : (Number(v) * Math.PI) / 180;
  }, []);

  const debugLy = useMemo(() => {
    if (!import.meta.env.DEV) return null;
    const v = new URLSearchParams(location.search).get('ly');
    return v === null ? null : Number(v);
  }, []);

  // Prioridad negativa: corre ANTES que el resto de useFrame (p. ej. el cielo, que debe leer
  // la posición ya actualizada de la cámara). Ojo: una prioridad POSITIVA desactivaría el
  // renderizado automático de R3F.
  useFrame((_, dt) => {
    const t = THREE.MathUtils.clamp(rig.enter, 0, 1);

    // La órbita sólo avanza mientras no hemos empezado a entrar (se congela suavemente).
    if (debugTheta !== null) theta.current = debugTheta;
    else if (!reduced) theta.current += ORBIT_SPEED * dt * (1 - t);

    tmp.p0.set(Math.sin(theta.current) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(theta.current) * ORBIT_RADIUS);

    // Bézier cuadrática
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    tmp.pos.set(0, 0, 0).addScaledVector(tmp.p0, a).addScaledVector(APPROACH, b).addScaledVector(cockpit.pilotPos, c);

    // Hacia dónde mira: se mantiene en el avión hasta estar cerca y entonces gira al frente.
    tmp.look.lerpVectors(LOOK_EXTERIOR, tmp.lookForward, smoothstep(0.35, 1, t));
    if (debugLy !== null && t < 1) tmp.look.y = debugLy;

    // Matrix4.lookAt(eye, target, up) construye una rotación cuyo eje −Z apunta de eye a target,
    // que es la convención de las cámaras de three.js. La aplicamos en el espacio local.
    tmp.m.lookAt(tmp.pos, tmp.look, tmp.up);
    camera.position.copy(tmp.pos);
    camera.quaternion.setFromRotationMatrix(tmp.m);

    // El zoom "se abre" al entrar: lente de 38° (tele, para ver el avión) → 62° (visión humana en cabina).
    const fov = THREE.MathUtils.lerp(FOV_EXTERIOR, FOV_COCKPIT, smoothstep(0.3, 1, t));
    if (Math.abs(fov - camera.fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Piloto delantero: con la cámara dentro de su cabeza sólo veríamos caras por dentro.
    const hide = t > 0.8;
    if (cockpit.pilotFront && hide !== frontHidden.current) {
      cockpit.pilotFront.visible = !hide;
      frontHidden.current = hide;
    }
  }, -10);

  // <primitive> cuelga la cámara por defecto del grupo del avión (su padre en el árbol de React).
  return <primitive object={camera} />;
}
