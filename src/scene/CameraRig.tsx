import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig, useFlight } from '../store/flight';
import { prefersReducedMotion } from '../flight/scroll';
import { damp } from '../flight/route';
import type { CockpitRefs } from './cockpit';
import { cockpitFov } from './fov';

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
// campo vertical de ±31°. A 8° queda a 26° y se ve en la parte inferior.
const COCKPIT_PITCH = -8;

const FOV_EXTERIOR = 38;

// --- Cabeza del piloto (vista libre) ---
// La cabeza no gira alrededor de los ojos sino del cuello (la articulación atlanto-occipital y las
// vértebras cervicales), que está detrás y debajo de ellos. Así, al girar, los ojos se TRASLADAN
// unos centímetros: eso produce paralaje en lo cercano (la cabina) y nada en lo lejano.
const EYE_FROM_NECK = new THREE.Vector3(0, 0.08, 0.09); // ojos: 8 cm arriba y 9 cm delante del cuello
/** Al mirar a un lado, el piloto además inclina el tronco hacia ese lado (m a 90° de giro). */
const LEAN = 0.07;
/** λ del suavizado de la cabeza (1/s): el 95 % del giro en 3/7 ≈ 0.4 s. */
const HEAD_LAMBDA = 7;

// --- Modo focus (MFD) ---
/** Fracción de la vista que ocupa el MFD al acercarse. */
const FOCUS_FILL = 0.75;
const FOCUS_LAMBDA = 4.5;

const DEG = Math.PI / 180;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Centro, normal (hacia el piloto) y tamaño de mfd_main en el marco del cuerpo. */
function mfdFrame(mfd: THREE.Mesh, root: THREE.Object3D, pilotPos: THREE.Vector3) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mfd.matrixWorld);
  mfd.geometry.computeBoundingBox();
  const center = mfd.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(toRoot);
  // El plano tiene normal local +Y (ver cockpit.ts); transformDirection aplica sólo la rotación.
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(toRoot);
  if (normal.dot(pilotPos.clone().sub(center)) < 0) normal.negate();
  const size = new THREE.Box3().setFromObject(mfd).getSize(new THREE.Vector3());
  return { center, normal, side: Math.max(size.x, 0.05) };
}

/**
 * Cámara hija del avión: se mueve en el espacio LOCAL del avión, así que cuando éste se inclina,
 * el horizonte gira alrededor del piloto y la cabina se mantiene fija en pantalla.
 *
 * Posición durante la entrada (rig.enter = t, de 0 a 1): curva de Bézier cuadrática
 *     B(t) = (1−t)²·P0 + 2(1−t)t·P1 + t²·P2
 * P0 = punto de la órbita, P1 = APPROACH (sobre el canopy), P2 = cam_pilot.
 * La curva parte de P0 en dirección a P1 y llega a P2 con la tangente B'(1) = 2(P2 − P1),
 * es decir, bajando hacia los ojos del piloto a través del cristal (transparente), sin
 * cruzar el fuselaje opaco, que sí atravesaría una línea recta desde la órbita.
 *
 * El FOV de la cabina depende de la proporción de la ventana (fov.ts).
 * Dentro de la cabina se le suman la cabeza (vista libre) y el acercamiento al MFD (focus).
 */
export function CameraRig({ cockpit, root }: { cockpit: CockpitRefs; root: THREE.Object3D }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const theta = useRef(ORBIT_THETA0);
  const frontHidden = useRef(false);
  const tmp = useMemo(
    () => ({
      p0: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      head: new THREE.Vector3(),
      neck: cockpit.pilotPos.clone().sub(EYE_FROM_NECK),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      qFocus: new THREE.Quaternion(),
      e: new THREE.Euler(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [cockpit],
  );
  const reduced = useMemo(prefersReducedMotion, []);

  // Pose del modo focus: frente a la pantalla, a lo largo de su normal, a la distancia en que la
  // pantalla (lado s) ocupa FOCUS_FILL de la vista. Con media altura visible a distancia d igual a
  // d·tan(fov/2), queremos s/2 = FOCUS_FILL·d·tan(fov/2) ⇒ d = (s/2) / (FOCUS_FILL·tan(fov/2)).
  // En pantallas verticales manda el ancho: tan(fov_h/2) = tan(fov/2)·aspecto.
  const focusPose = useMemo(() => {
    if (!cockpit.mfd) return null;
    const f = mfdFrame(cockpit.mfd, root, cockpit.pilotPos);
    return { ...f, at: (aspect: number) => {
      const t = Math.tan((cockpitFov(aspect) / 2) * DEG) * Math.min(1, aspect);
      return f.center.clone().addScaledVector(f.normal, f.side / 2 / (FOCUS_FILL * t));
    } };
  }, [cockpit, root]);

  // Depuración sólo en desarrollo: /?theta=-40 (ángulo de la órbita) y /?ly=16 (altura a la que mira)
  const debug = useMemo(() => {
    if (!import.meta.env.DEV) return { theta: null, ly: null };
    const q = new URLSearchParams(location.search);
    const n = (k: string) => (q.get(k) === null ? null : Number(q.get(k)));
    const th = n('theta');
    return { theta: th === null ? null : th * DEG, ly: n('ly') };
  }, []);

  // Prioridad negativa: corre ANTES que el resto de useFrame (p. ej. el cielo, que debe leer
  // la posición ya actualizada de la cámara). Ojo: una prioridad POSITIVA desactivaría el
  // renderizado automático de R3F.
  useFrame((state, dt) => {
    const t = THREE.MathUtils.clamp(rig.enter, 0, 1);
    const mode = useFlight.getState().camMode;
    dt = Math.min(dt, 0.05);

    // La órbita sólo avanza mientras no hemos empezado a entrar (se congela suavemente).
    if (debug.theta !== null) theta.current = debug.theta;
    else if (!reduced) theta.current += ORBIT_SPEED * dt * (1 - t);

    tmp.p0.set(Math.sin(theta.current) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(theta.current) * ORBIT_RADIUS);

    // ---- Cabeza: suavizado exponencial hacia el objetivo (k = 1 − e^(−λ·dt)) ----
    const L = rig.look;
    const lambda = reduced ? 30 : HEAD_LAMBDA;
    L.yaw = damp(L.yaw, L.tYaw, lambda, dt);
    L.pitch = damp(L.pitch, L.tPitch, lambda, dt);

    // Ojos = cuello + R(cabeza)·EYE_FROM_NECK, más la inclinación lateral del tronco.
    // Guiñada positiva = mirar a la DERECHA = girar hacia −X (por eso el signo menos en Y).
    tmp.e.set(-L.pitch * DEG, -L.yaw * DEG, 0, 'YXZ');
    tmp.head.copy(EYE_FROM_NECK).applyEuler(tmp.e).add(tmp.neck);
    tmp.head.x -= Math.sin(L.yaw * DEG) * LEAN;

    // Bézier cuadrática de la entrada; su punto final son los ojos (ya con la cabeza aplicada).
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    tmp.pos.set(0, 0, 0).addScaledVector(tmp.p0, a).addScaledVector(APPROACH, b).addScaledVector(tmp.head, c);

    // Dirección de la mirada en cabina: COCKPIT_PITCH + cabeceo de la cabeza, y la guiñada.
    // Coordenadas esféricas con delante = +Z y derecha = −X.
    const yaw = L.yaw * DEG, pitch = (COCKPIT_PITCH + L.pitch) * DEG;
    tmp.dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    // Hacia dónde mira: se mantiene en el avión hasta estar cerca y entonces gira al frente.
    tmp.look.copy(tmp.head).addScaledVector(tmp.dir, 50);
    tmp.look.lerpVectors(LOOK_EXTERIOR, tmp.look, smoothstep(0.35, 1, t));
    if (debug.ly !== null && t < 1) tmp.look.y = debug.ly;

    // Matrix4.lookAt(eye, target, up) construye una rotación cuyo eje −Z apunta de eye a target,
    // que es la convención de las cámaras de three.js. La aplicamos en el espacio local.
    tmp.m.lookAt(tmp.pos, tmp.look, tmp.up);
    tmp.q.setFromRotationMatrix(tmp.m);

    // ---- Focus: mezcla hacia la pose frente al MFD ----
    // Posición: interpolación lineal; orientación: slerp (interpolación esférica de cuaterniones,
    // que gira por el arco más corto a velocidad angular constante; interpolar ángulos de Euler
    // por separado haría trayectorias raras).
    rig.focus = reduced ? (mode === 'focus' ? 1 : 0) : damp(rig.focus, mode === 'focus' ? 1 : 0, FOCUS_LAMBDA, dt);
    if (focusPose && rig.focus > 1e-3) {
      const k = smoothstep(0, 1, rig.focus);
      const at = focusPose.at(state.size.width / state.size.height);
      tmp.m.lookAt(at, focusPose.center, tmp.up);
      tmp.qFocus.setFromRotationMatrix(tmp.m);
      tmp.pos.lerp(at, k);
      tmp.q.slerp(tmp.qFocus, k);
    }
    camera.position.copy(tmp.pos);
    camera.quaternion.copy(tmp.q);

    // El zoom "se abre" al entrar: lente de 38° (tele, para ver el avión) → 62° (visión humana en cabina).
    const fov = THREE.MathUtils.lerp(FOV_EXTERIOR, cockpitFov(state.size.width / state.size.height), smoothstep(0.3, 1, t));
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
