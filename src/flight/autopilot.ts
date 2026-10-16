// Piloto automático: quién vuela el avión y cómo se pasa el control.
//
//   'auto'   → el scroll recorre la ruta (route.ts: stepFlight).
//   'manual' → el usuario vuela con el teclado (manual.ts: stepManual).
//   'return' → el piloto automático vuelve a la ruta con el guiado de persecución pura y, al
//              alinearse, devuelve el control al scroll (traspaso sin saltos).
//
// Las transiciones se hacen aquí, FUERA de useFrame (en eventos de teclado/clic o en un vigilante a
// 10 Hz), porque cambian el store de React. useFrame sólo integra la física y levanta banderas.

import { rig, useFlight } from '../store/flight';
import { CONTENT } from '../data/content';
import { altAt, angDiff, headingAt, posAt, type FlightState } from './route';
import {
  AREA_RADIUS, attitudeOf, createManualState, projectOnRoute, waypointNear, type ManualState,
} from './manual';
import { goToSection, lockScroll, resumeRoute, setThrottleDir } from './scroll';
import { setThrottle as setEngineSound } from '../audio/engine';
import { radio } from '../hud/overlay/radioQueue';

const store = () => useFlight.getState();

/** El vuelo manual necesita teclado: en pantallas táctiles (puntero "grueso") no se ofrece. */
export const manualAllowed = () => matchMedia('(pointer: fine)').matches;

/** Diferencia entre la posición "del suelo" (con deriva) y la de navegación al empezar a volar a
 *  mano: se conserva para que las luces de la ciudad no salten. */
const groundOff = { x: 0, z: 0 };
/** Sección a la que volar cuando el regreso a la ruta termine (menú, 1–6, Enter...). */
let pending: number | null = null;

/** Botón A/P, rótulo del MFD y tecla P. */
export function toggleAutopilot() {
  if (store().pilot === 'auto') engageManual();
  else requestReturn();
}

export function engageManual() {
  const s = store();
  if (s.camMode === 'exterior' || s.pilot !== 'auto') return;
  if (!manualAllowed()) {
    radio('CONTROL', 'El control manual necesita teclado. El piloto automático sigue conectado.', true);
    return;
  }
  const f = rig.flight;
  setThrottleDir(0);
  lockScroll(true);
  // Se parte del estado actual: la trayectoria (γ) en lugar del cabeceo de la nariz, porque el
  // modelo manual no tiene ángulo de ataque. La velocidad de la ruta se lleva a un rango de vuelo.
  rig.manual = createManualState(f.heading, f.gamma, f.roll, f.navX, f.navZ, f.alt, Math.min(300, Math.max(180, f.kts / 1.944)));
  groundOff.x = f.x - f.navX;
  groundOff.z = f.z - f.navZ;
  rig.returnDone = false;
  s.setPilot('manual');
  radio('CONTROL', 'Piloto automático desconectado. Tienes el control: W/S cabeceo, A/D alabeo, Space acelera, Shift frena.', true);
}

/** Conecta el piloto automático; si se pide una sección, vuela a ella al recuperar la ruta. */
export function requestReturn(section?: number) {
  const s = store();
  if (s.pilot === 'auto') {
    if (section !== undefined) goToSection(section);
    return;
  }
  if (section !== undefined) pending = section;
  if (s.pilot === 'return') return;
  rig.returnDone = false;
  s.setPilot('return');
  setEngineSound(false);
  radio('CONTROL', 'Piloto automático conectado: regresando a la ruta.', true);
}

/** Tocar W/A/S/D durante el regreso devuelve el mando al usuario (como en un avión real). */
export function takeover() {
  if (store().pilot !== 'return') return;
  pending = null;
  store().setPilot('manual');
  radio('CONTROL', 'Piloto automático desconectado.', true);
}

/** Copia el estado manual a FlightState, que es lo que leen la escena, el HUD y el radar. */
export function syncFromManual(f: FlightState, m: ManualState, dt: number) {
  const a = attitudeOf(m.q);
  f.heading = a.heading;
  f.pitch = a.pitch;
  f.roll = a.roll;
  f.bank = a.roll;
  f.gamma = a.pitch; // sin ángulo de ataque, la nariz va por la trayectoria
  f.alt = m.alt;
  f.kts = m.v * 1.944; // m/s → nudos
  f.n = m.n;
  f.navX = m.east;
  f.navZ = m.north;
  f.x = m.east + groundOff.x;
  f.z = m.north + groundOff.z;
  f.t += dt;
}

/** Traspaso 'return' → 'auto': el avión ya vuela sobre la ruta; el scroll toma el relevo. */
function handover() {
  const m = rig.manual;
  if (!m) return;
  const f = rig.flight;
  const { s } = projectOnRoute(m.east, m.north);
  const a = attitudeOf(m.q);
  // Lo que todavía no coincide se guarda como desfase y se desvanece en unos segundos.
  f.hOff = angDiff(a.heading, headingAt(s));
  f.altOff = m.alt - altAt(s);
  f.bank = a.roll;
  const p = posAt(s);
  f.driftX = m.east + groundOff.x - p.x;
  f.driftZ = m.north + groundOff.z - p.z;
  f.s = s;
  rig.manual = null;
  rig.returnDone = false;
  const target = pending;
  pending = null;
  store().setPilot('auto');
  lockScroll(false);
  resumeRoute(s, target);
  radio('CONTROL', target === null ? 'En ruta. Continuamos hacia el siguiente waypoint.' : `En ruta. Rumbo a ${CONTENT.sections[target]!.label}.`, true);
}

/**
 * Vigilante a 10 Hz: traspasos, captura de waypoints en vuelo manual, límite del área y avisos.
 * Devuelve la función que lo detiene.
 */
export function initAutopilot() {
  let outsideSince = -1;
  let wasGcas = false;
  const id = window.setInterval(() => {
    const s = store();
    if (s.pilot === 'auto') {
      if (s.alert) s.setAlert('');
      return;
    }
    const m = rig.manual;
    if (!m) return;
    if (rig.returnDone && s.pilot === 'return') return handover();

    // Pasar cerca de un waypoint lo "alcanza": cambia la sección (radio, MFD, menú).
    const wp = waypointNear(m.east, m.north);
    if (wp >= 0) s.setSection(wp);

    // Área de operaciones: avisar al salir y, si no se vuelve en 10 s, conectar el autopiloto.
    const out = projectOnRoute(m.east, m.north).dist > AREA_RADIUS;
    const now = performance.now();
    if (out && s.pilot === 'manual') {
      if (outsideSince < 0) {
        outsideSince = now;
        radio('AWACS', 'Estás saliendo del área de operaciones. Da la vuelta.', true);
      } else if (now - outsideSince > 10000) requestReturn();
    } else outsideSince = -1;

    if (m.gcas && !wasGcas) radio('SISTEMA', 'AUTO-GCAS: recuperación automática. ¡Cuidado con el suelo!', true);
    wasGcas = m.gcas;
    s.setAlert(m.gcas ? 'gcas' : out && s.pilot === 'manual' ? 'area' : '');
  }, 100);
  return () => clearInterval(id);
}
